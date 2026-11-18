<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		CircleDot,
		EyeOff,
		Focus,
		Hand,
		Mouse,
		PanelLeftClose,
		PanelLeftOpen,
		RotateCcw,
		ScanEye,
		Tag,
		X,
		Crosshair,
		ArrowRight
	} from '@lucide/svelte';
	import { onMount } from 'svelte';
	import LayerTree from '#lib/components/LayerTree.svelte';
	import { partIndex, partName, partPath, SYSTEMS } from '#lib/data/systems.ts';
	import { NODE_SCALE, scene, type ScrollMode } from '#lib/state/scene.svelte.ts';
	import { viewer } from '#lib/viewer/api.ts';

	let panelOpen = $state(true);

	onMount(() => {
		scene.quiz = null;
		scene.pickHandler = (partId) => {
			if (partId) scene.toggleSelect(partId);
		};
		return () => {
			scene.pickHandler = null;
		};
	});

	const MAX_CHIPS = 6;
	const selected = $derived([...scene.selected]);
	const focus = $derived(scene.focus && scene.selected.has(scene.focus) ? scene.focus : null);
	const focusEntry = $derived(focus ? partIndex.get(focus) : null);

	const SCROLL_MODES: { mode: ScrollMode; label: string; hint: string }[] = [
		{ mode: 'auto', label: 'Auto', hint: 'Trackpad scroll orbits, mouse wheel zooms' },
		{ mode: 'orbit', label: 'Orbit', hint: 'Scrolling always orbits' },
		{ mode: 'zoom', label: 'Zoom', hint: 'Scrolling always zooms' }
	];
	const scrollInfo = $derived(SCROLL_MODES.find((m) => m.mode === scene.scrollMode)!);
	function cycleScroll() {
		const i = SCROLL_MODES.findIndex((m) => m.mode === scene.scrollMode);
		scene.setScrollMode(SCROLL_MODES[(i + 1) % SCROLL_MODES.length].mode);
	}
</script>

<svelte:head><title>Explore · Anatomy Quiz Tools</title></svelte:head>

{#if panelOpen}
	<aside class="panel" aria-label="Anatomy layers">
		<div class="panel-head">
			<h2>Layers</h2>
			<button class="btn ghost" onclick={() => scene.showAll()}>Show all</button>
			<button class="icon-btn" onclick={() => (panelOpen = false)} aria-label="Collapse layer panel">
				<PanelLeftClose size={20} />
			</button>
		</div>
		<LayerTree />
		<div class="panel-foot">
			<span>{selected.length} selected</span>
			{#if selected.length}
				<button class="btn ghost" onclick={() => scene.clearSelection()}>Clear</button>
			{/if}
			<a class="btn btn-primary" href={resolve('/quiz')}>Quiz…</a>
		</div>
	</aside>
{:else}
	<aside class="rail" aria-label="Anatomy layers (collapsed)">
		<button class="icon-btn solid" onclick={() => (panelOpen = true)} aria-label="Expand layer panel">
			<PanelLeftOpen size={20} />
		</button>
		{#each SYSTEMS.filter((s) => s.available) as s (s.id)}
			{@const vis = !scene.hiddenSystems.has(s.id)}
			<button
				class="icon-btn"
				onclick={() => scene.showSystem(s.id, !vis)}
				aria-pressed={vis}
				aria-label="{vis ? 'Hide' : 'Show'} {s.name}"
				title={s.name}
			>
				<span class="swatch" style:background={s.color} style:opacity={vis ? 1 : 0.35}></span>
			</button>
		{/each}
	</aside>
{/if}

<div class="overlay">
	<div class="top">
		<div class="chips" aria-label="Selected structures">
			{#each selected.slice(0, MAX_CHIPS) as id (id)}
				<span class="chip">
					<button class="chip-name" onclick={() => (scene.focus = id)}>{partName(id)}</button>
					<button class="chip-x" onclick={() => scene.toggleSelect(id)} aria-label="Deselect {partName(id)}">
						<X size={12} />
					</button>
				</span>
			{/each}
			{#if selected.length > MAX_CHIPS}
				<span class="chip more">+{selected.length - MAX_CHIPS} more</span>
			{/if}
		</div>
		<div class="toolbar" role="toolbar" aria-label="Viewer tools">
			<button class="icon-btn" onclick={() => viewer.reset()} aria-label="Reset camera" title="Reset camera">
				<RotateCcw size={18} />
			</button>
			<button
				class="tool"
				aria-pressed={scene.labelsOn}
				onclick={() => (scene.labelsOn = !scene.labelsOn)}
			>
				<Tag size={18} aria-hidden="true" /> Labels
			</button>
			<button
				class="tool"
				aria-pressed={scene.xray}
				onclick={() => ((scene.xray = !scene.xray), (scene.isolate = false))}
				title="Fade everything except the selection"
			>
				<ScanEye size={18} aria-hidden="true" /> X-ray
			</button>
			<button
				class="tool"
				aria-pressed={scene.isolate}
				onclick={() => ((scene.isolate = !scene.isolate), (scene.xray = false))}
				title="Show only the selection"
			>
				<Crosshair size={18} aria-hidden="true" /> Isolate
			</button>
			{#if !scene.hiddenSystems.has('lymphoid')}
				<span class="sep" aria-hidden="true"></span>
				<label class="tool size" title="Draw lymph nodes larger than life, to make them easier to see and click">
					<CircleDot size={18} aria-hidden="true" /> Node size
					<input
						type="range"
						min={NODE_SCALE.min}
						max={NODE_SCALE.max}
						step={NODE_SCALE.step}
						value={scene.nodeScale}
						oninput={(e) => scene.setNodeScale(Number(e.currentTarget.value))}
					/>
					<span class="val">{scene.nodeScale}×</span>
				</label>
			{/if}
			<span class="sep" aria-hidden="true"></span>
			<button class="tool" onclick={cycleScroll} title={scrollInfo.hint} aria-label="Scroll behavior: {scrollInfo.label}. {scrollInfo.hint}">
				{#if scene.scrollMode === 'zoom'}<Mouse size={18} aria-hidden="true" />{:else}<Hand size={18} aria-hidden="true" />{/if}
				Scroll: {scrollInfo.label}
			</button>
		</div>
	</div>

	<p class="hints">
		{#if scene.scrollMode === 'zoom'}
			<span>Scroll — zoom</span><span>Drag — orbit</span>
		{:else}
			<span>Two-finger scroll — orbit</span><span>Pinch — zoom</span>
		{/if}
		<span>Shift + scroll — pan</span><span>Click — select</span><span>Double-click — focus</span>
	</p>

	{#if focus && focusEntry}
		<div class="card">
			<div class="path">{partPath(focus)}</div>
			<div class="name">
				{focusEntry.part.name}
				{#if focusEntry.part.sides}<span class="lr">left &amp; right</span>{/if}
			</div>
			<div class="actions">
				<button class="btn" onclick={() => viewer.frameParts([focus])}><Focus size={16} aria-hidden="true" />Frame</button>
				<button class="btn" onclick={() => scene.hiddenParts.add(focus)}><EyeOff size={16} aria-hidden="true" />Hide</button>
				<a class="btn link" href={resolve('/quiz')}>Quiz selection <ArrowRight size={16} aria-hidden="true" /></a>
			</div>
		</div>
	{/if}
</div>

<style>
	.panel {
		grid-area: left;
		width: 320px;
		display: flex;
		flex-direction: column;
		min-height: 0;
		background: var(--panel);
		border-right: 1px solid var(--border);
	}
	.panel-head {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 12px 8px 10px 16px;
	}
	h2 {
		margin: 0;
		flex: 1;
		font-family: var(--font-display);
		font-size: 16px;
		font-weight: 600;
	}
	.btn.ghost {
		background: transparent;
	}
	.panel-foot {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 16px;
		border-top: 1px solid var(--border);
		font-size: 13px;
		color: var(--muted);
	}
	.panel-foot span {
		flex: 1;
	}
	.rail {
		grid-area: left;
		width: 56px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		padding-top: 10px;
		background: var(--panel);
		border-right: 1px solid var(--border);
	}
	.icon-btn.solid {
		width: 44px;
		height: 44px;
		background: var(--panel-2);
		color: var(--text);
	}
	.swatch {
		width: 14px;
		height: 14px;
		border-radius: 4px;
	}

	/* Overlay sits on top of the viewer; only its controls catch the pointer. */
	.overlay {
		grid-area: viewer;
		position: relative;
		pointer-events: none;
		z-index: 1;
	}
	.overlay > * > *,
	.card {
		pointer-events: auto;
	}
	.top {
		position: absolute;
		left: 16px;
		right: 16px;
		top: 16px;
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: flex-start;
	}
	.chips {
		flex: 1;
		min-width: 200px;
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		pointer-events: none;
	}
	.chips > * {
		pointer-events: auto;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		height: 32px;
		border-radius: 16px;
		background: var(--panel-2);
		border: 1px solid #3a3220;
		color: var(--highlight-soft);
		font-size: 13px;
	}
	.chip.more {
		padding: 0 12px;
		color: var(--muted);
		border-color: var(--border);
	}
	.chip-name {
		height: 100%;
		padding: 0 4px 0 12px;
		border: none;
		background: transparent;
		color: inherit;
	}
	.chip-x {
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		border-radius: 14px;
		background: transparent;
		color: var(--text-2);
	}
	.chip-x:hover {
		background: var(--pressed);
	}
	.toolbar {
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 4px;
		border-radius: 10px;
		background: var(--panel);
		border: 1px solid var(--border);
	}
	.tool {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 40px;
		padding: 0 10px;
		border: none;
		border-radius: var(--radius);
		background: transparent;
		color: var(--text-2);
		font-size: 13px;
	}
	.tool:hover {
		background: var(--panel-2);
	}
	.tool[aria-pressed='true'] {
		background: var(--pressed);
		color: var(--accent);
	}
	.size input {
		width: 84px;
		accent-color: var(--accent);
	}
	.size .val {
		min-width: 2.6em;
		font-variant-numeric: tabular-nums;
		color: var(--text);
	}
	.sep {
		width: 1px;
		height: 24px;
		background: var(--border);
		margin: 0 4px;
	}
	.hints {
		position: absolute;
		left: 16px;
		bottom: 16px;
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 6px 14px;
		max-width: calc(100% - 360px);
		font-size: 12px;
		color: var(--faint);
	}
	.card {
		position: absolute;
		right: 16px;
		bottom: 16px;
		width: 320px;
		max-width: calc(100% - 32px);
		padding: 16px;
		border-radius: var(--radius-lg);
		background: var(--panel);
		border: 1px solid var(--border);
	}
	.path {
		font-size: 12px;
		color: var(--faint);
		margin-bottom: 4px;
	}
	.name {
		font-family: var(--font-display);
		font-size: 20px;
		font-weight: 600;
		margin-bottom: 12px;
	}
	.lr {
		font-family: var(--font-body);
		font-size: 12px;
		font-weight: 500;
		color: var(--muted);
		margin-left: 6px;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.btn.link {
		border: none;
		background: transparent;
		color: var(--accent);
		font-weight: 500;
	}
</style>
