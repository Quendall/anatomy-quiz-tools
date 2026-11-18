<script lang="ts">
	import { Canvas } from '@threlte/core';
	import { LoaderCircle } from '@lucide/svelte';
	import { scene } from '#lib/state/scene.svelte.ts';
	import Labels from './Labels.svelte';
	import Scene from './Scene.svelte';

	let width = $state(0);
	let height = $state(0);
	const loading = $derived([...scene.everShown].some((id) => !scene.loaded.has(id)));
</script>

<div class="viewer" bind:clientWidth={width} bind:clientHeight={height}>
	<Canvas renderMode="on-demand">
		<Scene />
	</Canvas>
	<Labels {width} {height} />
	{#if loading}
		<div class="loading" role="status">
			<LoaderCircle size={18} class="spin" aria-hidden="true" />
			Loading 3D model…
		</div>
	{/if}
</div>

<style>
	.viewer {
		position: absolute;
		inset: 0;
		overflow: hidden;
		background: var(--bg-viewer);
		touch-action: none;
	}
	.loading {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 16px;
		border-radius: var(--radius-lg);
		background: var(--panel);
		border: 1px solid var(--border);
		color: var(--text-2);
	}
	.loading :global(.spin) {
		animation: spin 1s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
