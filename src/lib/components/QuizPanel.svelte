<script lang="ts">
	import { resolve } from '$app/paths';
	import { X } from '@lucide/svelte';
	import type { Snippet } from 'svelte';

	let {
		title,
		subtitle,
		header,
		children
	}: { title: string; subtitle: string; header?: Snippet; children: Snippet } = $props();
</script>

<!-- Right-hand panel shared by the quiz modes; the viewer stays to its left. -->
<aside class="panel" aria-label="{title} quiz">
	<div class="head">
		<a class="exit" href={resolve('/quiz')} aria-label="Exit quiz"><X size={18} /></a>
		<div class="titles">
			<span class="title">{title}</span>
			<span class="sub">{subtitle}</span>
		</div>
	</div>
	{@render header?.()}
	<div class="body">
		{@render children()}
	</div>
</aside>

<style>
	.panel {
		grid-area: right;
		width: 420px;
		display: flex;
		flex-direction: column;
		min-height: 0;
		background: var(--panel);
		border-left: 1px solid var(--border);
	}
	.head {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px 20px 10px;
	}
	.exit {
		width: 40px;
		height: 40px;
		flex: none;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius);
		background: var(--panel-2);
		color: var(--text-2);
	}
	.exit:hover {
		color: var(--text);
		background: var(--pressed);
	}
	.titles {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.title {
		font-family: var(--font-display);
		font-size: 18px;
		font-weight: 600;
	}
	.sub {
		font-size: 12px;
		color: var(--muted);
	}
	.body {
		flex: 1;
		overflow-y: auto;
		padding: 16px 24px 24px;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}
</style>
