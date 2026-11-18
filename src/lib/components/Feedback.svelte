<script lang="ts">
	import { Check, X } from '@lucide/svelte';
	import type { Snippet } from 'svelte';

	let { ok, title, children }: { ok: boolean; title: string; children?: Snippet } = $props();
</script>

<div class="fb" class:ok role="status">
	<div class="title">
		{#if ok}<Check size={18} aria-hidden="true" />{:else}<X size={18} aria-hidden="true" />{/if}
		{title}
	</div>
	{@render children?.()}
</div>

<style>
	.fb {
		padding: 16px;
		border-radius: var(--radius-lg);
		background: var(--wrong-bg);
		border: 1px solid var(--wrong-border);
		display: flex;
		flex-direction: column;
		gap: 8px;
		font-size: 13px;
		line-height: 1.5;
		color: var(--text-2);
	}
	.fb.ok {
		background: var(--accent-bg);
		border-color: var(--accent-border);
	}
	.title {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 15px;
		font-weight: 600;
		color: var(--wrong-text);
	}
	.ok .title {
		color: var(--accent);
	}
</style>
