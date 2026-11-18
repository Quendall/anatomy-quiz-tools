<script lang="ts">
	import { asset } from '$app/paths';
	import { T, useThrelte } from '@threlte/core';
	import { BufferGeometry, Mesh, type Object3D } from 'three';
	import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
	import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
	import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
	import { onMount } from 'svelte';
	import { LYMPH_NODES, nodeToPart, partIndex, type SystemDef } from '#lib/data/systems.ts';
	import { scene } from '#lib/state/scene.svelte.ts';
	import { createMaterials } from './materials';
	import { scalableBlobs } from './nodeScale';
	import { registry } from './registry';

	// BVH-accelerated raycasting: picking and hover stay fast on ~350k-vertex models.
	BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
	BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
	Mesh.prototype.raycast = acceleratedRaycast;

	let { system }: { system: SystemDef } = $props();

	const { invalidate } = useThrelte();
	// One material set per color: the system color, plus any group overrides (blue veins).
	const materialSets = new Map<string, ReturnType<typeof createMaterials>>();
	function materialsFor(partId: string) {
		const color = partIndex.get(partId)?.group.color ?? system.color;
		let set = materialSets.get(color);
		if (!set) materialSets.set(color, (set = createMaterials(color)));
		return set;
	}
	let root = $state<Object3D | null>(null);
	let meshes: { mesh: Mesh; partId: string }[] = [];
	/** Lymph node meshes, which can be drawn larger than life (scene.nodeScale). */
	let scalers: ((scale: number) => void)[] = [];
	let error = $state<string | null>(null);

	onMount(() => {
		const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
		let cancelled = false;
		loader
			.loadAsync(asset(system.model as Parameters<typeof asset>[0]))
			.then((gltf) => {
				if (cancelled) return;
				gltf.scene.updateMatrixWorld(true);
				gltf.scene.traverse((o) => {
					if (!(o instanceof Mesh)) return;
					const partId = nodeToPart.get(o.name);
					if (!partId) {
						o.visible = false;
						return;
					}
					// Lymph nodes are tiny (a few hundred vertices) and change shape with
					// scene.nodeScale, so they use three's plain raycast instead of a BVH.
					if (LYMPH_NODES.has(partId)) scalers.push(scalableBlobs(o));
					else o.geometry.computeBoundsTree();
					registry.add(o, partId);
					meshes.push({ mesh: o, partId });
				});
				root = gltf.scene;
				scene.loaded.add(system.id);
				invalidate();
			})
			.catch((e: unknown) => {
				error = e instanceof Error ? e.message : String(e);
				console.error(`Failed to load ${system.model}`, e);
			});
		return () => {
			cancelled = true;
		};
	});

	$effect(() => {
		const s = scene.nodeScale;
		if (!root || !scalers.length) return;
		for (const apply of scalers) apply(s);
		invalidate();
	});

	// Re-apply visibility + material for every mesh whenever scene state changes.
	$effect(() => {
		if (!root) return;
		for (const { mesh, partId } of meshes) {
			const st = scene.stateOf(partId);
			mesh.visible = st !== 'hidden';
			if (st !== 'hidden') mesh.material = materialsFor(partId)[st];
			mesh.renderOrder =
					st === 'target' || st === 'correct' || st === 'wrong'
						? 2
						: st === 'xray' || st === 'ghost'
							? 1
							: 0;
		}
		invalidate();
	});
</script>

{#if root}
	<T is={root} />
{/if}
