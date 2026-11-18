<script lang="ts">
	import { partIndex } from '#lib/data/systems.ts';
	import { scene, type LabelAnchor } from '#lib/state/scene.svelte.ts';

	let { width, height }: { width: number; height: number } = $props();

	const LABEL_H = 44;
	const GAP = 8;
	const LABEL_W = 190;
	const TOP = 76;

	interface Placed extends LabelAnchor {
		name: string;
		sub: string;
		ly: number;
		lx: number;
		side: 'left' | 'right';
	}

	/** Stack labels in a column on each side of the model, pushed apart so none overlap. */
	function column(items: LabelAnchor[], side: 'left' | 'right'): Placed[] {
		if (!items.length) return [];
		const sorted = items.slice().sort((a, b) => a.y - b.y);
		const xs = sorted.map((a) => a.x);
		const lx =
			side === 'left'
				? Math.max(16, Math.min(...xs) - 90 - LABEL_W)
				: Math.min(width - 16 - LABEL_W, Math.max(...xs) + 90);
		// Keep labels clear of the toolbar row along the top of the viewer.
		const ys = sorted.map((a) => Math.max(TOP, a.y - LABEL_H / 2));
		for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + LABEL_H + GAP);
		const maxY = height - 16 - LABEL_H;
		if (ys.length && ys[ys.length - 1] > maxY) {
			ys[ys.length - 1] = maxY;
			for (let i = ys.length - 2; i >= 0; i--) ys[i] = Math.min(ys[i], ys[i + 1] - LABEL_H - GAP);
		}
		return sorted.map((a, i) => {
			const e = partIndex.get(a.partId);
			return {
				...a,
				name: e?.part.name ?? a.partId,
				sub: e?.group.name ?? '',
				ly: Math.max(TOP, ys[i]),
				lx,
				side
			};
		});
	}

	const placed = $derived.by(() => {
		const a = scene.labelAnchors;
		const cx = width / 2;
		return [
			...column(
				a.filter((p) => p.x < cx),
				'left'
			),
			...column(
				a.filter((p) => p.x >= cx),
				'right'
			)
		];
	});
</script>

{#if placed.length}
	<svg class="lines" {width} {height} aria-hidden="true">
		{#each placed as p (p.partId)}
			<line
				x1={p.x}
				y1={p.y}
				x2={p.side === 'left' ? p.lx + LABEL_W : p.lx}
				y2={p.ly + LABEL_H / 2}
			/>
			<circle cx={p.x} cy={p.y} r="4.5" />
		{/each}
	</svg>
	{#each placed as p (p.partId)}
		<div
			class="label"
			class:left={p.side === 'left'}
			style:left="{p.lx}px"
			style:top="{p.ly}px"
			style:width="{LABEL_W}px"
		>
			<div class="name">{p.name}</div>
			<div class="sub">{p.sub}</div>
		</div>
	{/each}
{/if}

<style>
	.lines {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}
	line {
		stroke: var(--highlight);
		stroke-width: 1.5;
	}
	circle {
		fill: var(--highlight);
		stroke: rgba(251, 191, 36, 0.3);
		stroke-width: 6;
	}
	.label {
		position: absolute;
		pointer-events: none;
		padding: 6px 10px;
		border-radius: var(--radius);
		background: rgba(14, 17, 22, 0.94);
		border: 1px solid var(--highlight);
		height: 44px;
		overflow: hidden;
	}
	.label.left {
		text-align: right;
	}
	.name {
		font-size: 13px;
		font-weight: 600;
		color: var(--highlight-soft);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.sub {
		font-size: 11px;
		color: var(--muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
