<script lang="ts">
	import { asset } from '$app/paths';
	import { T, useThrelte } from '@threlte/core';
	import { BufferGeometry, Mesh, type Object3D } from 'three';
	import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
	import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
	import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
	import { onMount } from 'svelte';
	import { nodeToPart, type SystemDef } from '#lib/data/systems.ts';
	import { scene } from '#lib/state/scene.svelte.ts';
	import { createMaterials } from './materials';
	import { registry } from './registry';

	// BVH-accelerated raycasting: picking and hover stay fast on ~350k-vertex models.
	BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
	BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
	Mesh.prototype.raycast = acceleratedRaycast;

	let { system }: { system: SystemDef } = $props();

	const { invalidate } = useThrelte();
	const materials = $derived(createMaterials(system.color));
	let root = $state<Object3D | null>(null);
	let meshes: { mesh: Mesh; partId: string }[] = [];
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
					o.geometry.computeBoundsTree();
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

	// Re-apply visibility + material for every mesh whenever scene state changes.
	$effect(() => {
		if (!root) return;
		for (const { mesh, partId } of meshes) {
			const st = scene.stateOf(partId);
			mesh.visible = st !== 'hidden';
			if (st !== 'hidden') mesh.material = materials[st];
			mesh.renderOrder = st === 'xray' || st === 'ghost' ? 1 : 0;
		}
		invalidate();
	});
</script>

{#if root}
	<T is={root} />
{/if}
