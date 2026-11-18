<script lang="ts">
	import { resolve } from '$app/paths';
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import { page } from '$app/state';
	import { Bone } from '@lucide/svelte';
	import Viewer from '#lib/viewer/Viewer.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	const inQuiz = $derived((page.route.id ?? '').startsWith('/quiz'));
	// The viewer stays mounted on every route (so models load once); these routes don't show it.
	const showViewer = $derived(!['/quiz', '/credits'].includes(page.route.id ?? ''));
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Anatomy Quiz Tools</title>
</svelte:head>

<div class="app">
	<header>
		<a class="brand" href={resolve('/')}>
			<Bone size={24} color="var(--accent)" aria-hidden="true" />
			<span>Anatomy Quiz Tools</span>
		</a>
		<nav aria-label="Main">
			<a href={resolve('/')} aria-current={inQuiz ? undefined : 'page'}>Explore</a>
			<a href={resolve('/quiz')} aria-current={inQuiz ? 'page' : undefined}>Quiz</a>
		</nav>
		<a class="credit" href={resolve('/credits')}>3D models: Z-Anatomy · CC BY-SA 4.0</a>
	</header>
	<main class="workspace" class:no-viewer={!showViewer}>
		<section class="viewer-area" aria-label="3D viewer">
			<Viewer />
		</section>
		{@render children()}
	</main>
</div>

<style>
	.app {
		height: 100vh;
		display: flex;
		flex-direction: column;
	}
	header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px 28px;
		padding: 10px 20px;
		border-bottom: 1px solid var(--border);
		background: var(--header);
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 10px;
		color: var(--text);
		text-decoration: none;
		font-family: var(--font-display);
		font-weight: 600;
		font-size: 17px;
		letter-spacing: -0.01em;
	}
	nav {
		display: flex;
		gap: 4px;
	}
	nav a {
		padding: 10px 16px;
		border-radius: var(--radius);
		color: var(--muted);
		text-decoration: none;
		font-weight: 500;
	}
	nav a[aria-current='page'] {
		background: var(--panel-2);
		color: var(--text);
	}
	.credit {
		margin-left: auto;
		font-size: 12px;
		color: var(--faint);
		text-decoration: none;
	}
	/* Pages place panels with grid-area: left | right, and overlays with grid-area: viewer. */
	.workspace {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		grid-template-rows: minmax(0, 1fr);
		grid-template-areas: 'left viewer right';
	}
	.viewer-area {
		grid-area: viewer;
		position: relative;
		min-width: 0;
	}
	.workspace.no-viewer {
		display: block;
		overflow-y: auto;
	}
	.workspace.no-viewer .viewer-area {
		display: none;
	}
</style>
