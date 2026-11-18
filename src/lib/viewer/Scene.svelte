<script lang="ts">
	import { T, useTask, useThrelte } from '@threlte/core';
	import CameraControls from 'camera-controls';
	import {
		Box3,
		Color,
		Matrix4,
		PerspectiveCamera,
		Quaternion,
		Raycaster,
		Sphere,
		Spherical,
		Vector2,
		Vector3,
		Vector4,
		type Mesh
	} from 'three';
	import { SYSTEMS } from '#lib/data/systems.ts';
	import { scene, type LabelAnchor } from '#lib/state/scene.svelte.ts';
	import { installViewerApi, viewer } from './api';
	import { registry } from './registry';
	import SystemModel from './SystemModel.svelte';
	import { attachTrackpad } from './trackpad';

	CameraControls.install({
		THREE: { Vector2, Vector3, Vector4, Quaternion, Matrix4, Spherical, Box3, Sphere, Raycaster }
	});

	const { dom, invalidate, scene: threeScene } = useThrelte();
	// Dev-only handle for debugging in the browser console.
	if (import.meta.env.DEV) Object.assign(window, { __aqt: { scene, registry, getCamera: () => camera } });
	threeScene.background = new Color('#0a0d11');

	// Default full-body front view (model is ~1.7 m tall, Y-up, facing +Z).
	const HOME = { pos: [0, 0.95, 3.7] as const, target: [0, 0.86, 0] as const };

	let camera = $state<PerspectiveCamera>();
	let controls: CameraControls | undefined;

	$effect(() => {
		if (!camera) return;
		const c = new CameraControls(camera, dom);
		const A = CameraControls.ACTION;
		c.mouseButtons.left = A.ROTATE;
		c.mouseButtons.right = A.TRUCK;
		c.mouseButtons.middle = A.DOLLY;
		c.mouseButtons.wheel = A.NONE; // handled by attachTrackpad
		c.touches.one = A.TOUCH_ROTATE;
		c.touches.two = A.TOUCH_DOLLY_TRUCK;
		c.smoothTime = 0.12;
		c.draggingSmoothTime = 0.06;
		c.minDistance = 0.12;
		c.maxDistance = 7;
		c.setLookAt(...HOME.pos, ...HOME.target, false);
		controls = c;

		const detachWheel = attachTrackpad(dom, c, () => scene.scrollMode, invalidate);
		const uninstall = installViewerApi({
			frameParts(ids, opts) {
				const s = registry.sphereOf(ids);
				if (!s) return;
				s.radius = Math.max(s.radius * (opts?.padding ?? 1.5), 0.05);
				c.fitToSphere(s, opts?.animate ?? true);
				invalidate();
			},
			focusPart(partId, opts) {
				// For a left/right pair, frame one side (picked at random) so the camera can get close.
				// Check the visibility state, not mesh.visible: a quiz may have just revealed the
				// part, and the meshes only update when effects next flush.
				const meshes = scene.isVisible(partId) ? (registry.byPart.get(partId) ?? []) : [];
				// Model still loading (e.g. a quiz page opened directly): retry once it is in.
				pendingFocus = meshes.length ? null : { partId, opts };
				if (!meshes.length || !camera) return;
				const one = meshes[Math.floor(Math.random() * meshes.length)];
				const s = new Box3().setFromObject(one).getBoundingSphere(new Sphere());
				const dir = bestViewDirection(partId, s.center, [one]);
				const fov = (camera.fov * Math.PI) / 180;
				const radius = Math.max(s.radius, 0.03) * (opts?.padding ?? 2.2);
				const dist = Math.max(radius / Math.sin(fov / 2), 0.3);
				const pos = s.center.clone().addScaledVector(dir, dist);
				c.setLookAt(pos.x, pos.y, pos.z, s.center.x, s.center.y, s.center.z, opts?.animate ?? true);
				invalidate();
			},
			reset(animate = true) {
				pendingFocus = null;
				c.setLookAt(...HOME.pos, ...HOME.target, animate);
				invalidate();
			}
		});
		invalidate();
		return () => {
			detachWheel();
			uninstall();
			c.dispose();
			controls = undefined;
		};
	});

	let pendingFocus: { partId: string; opts?: { padding?: number; animate?: boolean } } | null = null;
	$effect(() => {
		void scene.loaded.size;
		// Wait until effects have flushed so the new meshes' visibility has been applied.
		const t = setTimeout(() => {
			const p = pendingFocus;
			if (p && registry.byPart.get(p.partId)?.length) viewer.focusPart(p.partId, p.opts);
		}, 0);
		return () => clearTimeout(t);
	});

	// --- Picking ---------------------------------------------------------------
	const raycaster = new Raycaster();
	raycaster.firstHitOnly = true;

	/**
	 * Try 8 directions around the body (slightly from above) and pick the one from which
	 * rays to sample points on the part hit the part itself most often — i.e. the least
	 * occluded view. Ties prefer the front.
	 */
	function bestViewDirection(partId: string, center: Vector3, targets: Mesh[]): Vector3 {
		const blockers = registry.meshes().filter((m) => m.visible);
		const samples: Vector3[] = [];
		for (const m of targets) {
			const box = new Box3().setFromObject(m);
			const mid = box.getCenter(new Vector3());
			const half = box.getSize(new Vector3()).multiplyScalar(0.3);
			samples.push(mid);
			for (const [x, y, z] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
				samples.push(mid.clone().add(new Vector3(x * half.x, y * half.y, z * half.z)));
			}
		}
		const ray = new Raycaster();
		ray.firstHitOnly = true;
		let best = new Vector3(0, 0.2, 1).normalize();
		let bestScore = -1;
		for (let i = 0; i < 8; i++) {
			const a = (i / 8) * Math.PI * 2; // 0 = front (+Z)
			const dir = new Vector3(Math.sin(a), 0.2, Math.cos(a)).normalize();
			const eye = center.clone().addScaledVector(dir, 1.2);
			let score = 0;
			for (const p of samples) {
				ray.set(eye, p.clone().sub(eye).normalize());
				const hit = ray.intersectObjects(blockers, false)[0];
				if (hit && hit.object.userData.partId === partId) score++;
			}
			// Small bias toward the front, then the sides, so ties pick a familiar view.
			const bias = Math.cos(a) * 0.01;
			if (score + bias > bestScore) {
				bestScore = score + bias;
				best = dir;
			}
		}
		return best;
	}
	const ndc = new Vector2();

	function hit(clientX: number, clientY: number): Mesh | null {
		if (!camera) return null;
		const r = dom.getBoundingClientRect();
		ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
		raycaster.setFromCamera(ndc, camera);
		const pickable = registry
			.meshes()
			.filter((m) => m.visible && scene.stateOf(m.userData.partId) !== 'xray');
		const hits = raycaster.intersectObjects(pickable, false);
		return (hits[0]?.object as Mesh) ?? null;
	}

	$effect(() => {
		let down: { x: number; y: number } | null = null;
		let raf = 0;
		let lastMove: PointerEvent | null = null;

		const onDown = (e: PointerEvent) => {
			down = e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
		};
		const onUp = (e: PointerEvent) => {
			if (!down || e.button !== 0) return;
			const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
			down = null;
			if (moved > 4) return; // that was an orbit drag, not a click
			const m = hit(e.clientX, e.clientY);
			scene.pickHandler?.(m ? (m.userData.partId as string) : null, m?.name ?? null, {
				shift: e.shiftKey
			});
		};
		const onDbl = (e: MouseEvent) => {
			const m = hit(e.clientX, e.clientY);
			if (m) {
				const s = registry.sphereOf([m.userData.partId]);
				if (s && controls) {
					s.radius = Math.max(s.radius * 1.6, 0.05);
					controls.fitToSphere(s, true);
					invalidate();
				}
			}
		};
		const hover = () => {
			raf = 0;
			const e = lastMove;
			if (!e || e.buttons) return;
			const m = hit(e.clientX, e.clientY);
			const id = (m?.userData.partId as string) ?? null;
			if (id !== scene.hovered) scene.hovered = id;
			dom.style.cursor = id ? 'pointer' : '';
		};
		const onMove = (e: PointerEvent) => {
			lastMove = e;
			if (!raf) raf = requestAnimationFrame(hover);
		};
		const onLeave = () => {
			scene.hovered = null;
			dom.style.cursor = '';
		};
		dom.addEventListener('pointerdown', onDown);
		dom.addEventListener('pointerup', onUp);
		dom.addEventListener('dblclick', onDbl);
		dom.addEventListener('pointermove', onMove);
		dom.addEventListener('pointerleave', onLeave);
		return () => {
			cancelAnimationFrame(raf);
			dom.removeEventListener('pointerdown', onDown);
			dom.removeEventListener('pointerup', onUp);
			dom.removeEventListener('dblclick', onDbl);
			dom.removeEventListener('pointermove', onMove);
			dom.removeEventListener('pointerleave', onLeave);
		};
	});

	// --- Per frame: controls + label anchors ------------------------------------
	const tmp = new Vector3();

	function computeAnchors(): LabelAnchor[] {
		if (!camera || !scene.labelsOn || scene.quiz || scene.selected.size === 0) return [];
		const w = dom.clientWidth;
		const h = dom.clientHeight;
		const out: LabelAnchor[] = [];
		for (const partId of scene.selected) {
			if (scene.stateOf(partId) === 'hidden') continue;
			const meshes = registry.byPart.get(partId) ?? [];
			if (!meshes.length) continue;
			// For a left/right pair, label the side nearer the camera.
			let best = meshes[0];
			let bestD = Infinity;
			for (const m of meshes) {
				const d = registry.centers.get(m)!.distanceToSquared(camera.position);
				if (d < bestD) {
					bestD = d;
					best = m;
				}
			}
			tmp.copy(registry.centers.get(best)!).project(camera);
			if (tmp.z > 1) continue; // behind the camera
			const x = ((tmp.x + 1) / 2) * w;
			const y = ((1 - tmp.y) / 2) * h;
			if (x < 0 || x > w || y < 0 || y > h) continue; // off-screen: no label
			out.push({ partId, x, y });
		}
		return out;
	}

	function same(a: LabelAnchor[], b: LabelAnchor[]) {
		if (a.length !== b.length) return false;
		for (let i = 0; i < a.length; i++) {
			if (a[i].partId !== b[i].partId) return false;
			if (Math.abs(a[i].x - b[i].x) > 0.5 || Math.abs(a[i].y - b[i].y) > 0.5) return false;
		}
		return true;
	}

	useTask(
		(delta) => {
			if (controls?.update(delta)) invalidate();
			const next = computeAnchors();
			if (!same(next, scene.labelAnchors)) scene.labelAnchors = next;
		},
		{ autoInvalidate: false }
	);

	// Rendering is on-demand: request a frame whenever label-relevant state changes,
	// so the per-frame task recomputes the anchors.
	$effect(() => {
		void [scene.selected.size, scene.labelsOn, scene.quiz, scene.isolate];
		void [scene.hiddenSystems.size, scene.hiddenGroups.size, scene.hiddenParts.size];
		invalidate();
	});

	// Re-render when the viewer is resized (e.g. panel collapse).
	$effect(() => {
		const ro = new ResizeObserver(() => invalidate());
		ro.observe(dom);
		return () => ro.disconnect();
	});
</script>

<T.PerspectiveCamera makeDefault fov={30} near={0.01} far={60} bind:ref={camera}>
	<T.DirectionalLight intensity={1.5} position={[0.8, 1, 0.4]} />
</T.PerspectiveCamera>
<T.HemisphereLight args={['#ffffff', '#30363f', 1.25]} />
<T.DirectionalLight intensity={0.5} position={[-2, 3, -3]} />

{#each SYSTEMS.filter((s) => s.available && scene.everShown.has(s.id)) as system (system.id)}
	<SystemModel {system} />
{/each}
