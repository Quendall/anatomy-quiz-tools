<script lang="ts">
	import { resolve } from '$app/paths';
	import { Check, Crosshair, Eye, EyeOff, MousePointerClick, X } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import EmptyScope from '#lib/components/EmptyScope.svelte';
	import Feedback from '#lib/components/Feedback.svelte';
	import QuizPanel from '#lib/components/QuizPanel.svelte';
	import { partName, partPath } from '#lib/data/systems.ts';
	import { FindQuestion } from '#lib/quiz/find.ts';
	import { shuffle } from '#lib/quiz/types.ts';
	import { quiz } from '#lib/state/quiz.svelte.ts';
	import { scene } from '#lib/state/scene.svelte.ts';
	import { viewer } from '#lib/viewer/api.ts';

	const ids = quiz.items.map((i) => i.id);
	const scope = new Set(ids);
	const maxMisses = quiz.settings.maxMisses;
	/** How many questions later a missed part is asked again. */
	const REQUEUE_GAP = 3;

	type Entry = { id: string; result: 'first' | 'found' | 'revealed'; misses: number };

	let queue = $state<string[]>(shuffle(ids));
	let index = $state(0);
	let q = $state<FindQuestion | null>(null);
	let misses = $state(0);
	let wrongIds = $state<string[]>([]);
	let lastWrong = $state<string | null>(null);
	let finished = $state<'found' | 'revealed' | null>(null);
	let history = $state<Entry[]>([]);
	let done = $state(false);
	/** Parts hidden with Shift-click to reach deeper ones; shown again on exit. */
	let peeled = $state<string[]>([]);

	const target = $derived(queue[index] ?? null);
	const firstTry = $derived(history.filter((h) => h.result === 'first').length);
	/** Parts not yet found on the first try at least once. */
	const remaining = $derived(ids.filter((id) => !history.some((h) => h.id === id && h.result === 'first')).length);

	function paint() {
		if (!target) return;
		const highlights: NonNullable<typeof scene.quiz>['highlights'] = wrongIds.map((partId) => ({
			partId,
			tone: 'wrong' as const
		}));
		if (finished === 'found') highlights.push({ partId: target, tone: 'correct' });
		if (finished === 'revealed') highlights.push({ partId: target, tone: 'target' });
		scene.quiz = { highlights, dimOthers: false, scope, hoverable: !finished };
	}

	function start() {
		const id = target;
		if (!id) {
			done = true;
			scene.quiz = null;
			viewer.reset();
			return;
		}
		q = new FindQuestion(id, maxMisses);
		misses = 0;
		wrongIds = [];
		lastWrong = null;
		finished = null;
		paint();
	}

	function finish(kind: 'found' | 'revealed') {
		if (!q || !target) return;
		finished = kind;
		if (peeled.includes(target)) unpeel([target]);
		history = [
			{ id: target, result: kind === 'found' && q.misses === 0 ? 'first' : kind, misses: q.misses },
			...history
		];
		// Missed or revealed parts come back later in the round.
		if (q.needsReview) {
			const at = Math.min(index + 1 + REQUEUE_GAP, queue.length);
			queue.splice(at, 0, target);
		}
		paint();
		// Pull back enough to show the neighbouring bones, so the location makes sense.
		if (kind === 'revealed') viewer.focusPart(target, { padding: 6 });
	}

	function peel(partId: string) {
		if (scene.hiddenParts.has(partId)) return;
		scene.hiddenParts.add(partId);
		peeled = [...peeled, partId];
	}

	function unpeel(ids: string[] = peeled) {
		for (const id of ids) scene.hiddenParts.delete(id);
		peeled = peeled.filter((id) => !ids.includes(id));
	}

	function onPick(partId: string | null, _node: string | null, mods: { shift: boolean }) {
		if (mods.shift) {
			// Shift-click hides a part that is in the way; it never counts as an answer.
			if (partId) peel(partId);
			return;
		}
		if (!q || finished) return;
		const out = q.click(partId);
		if (out.kind === 'ignored') return;
		misses = out.misses;
		if (out.kind === 'found') return finish('found');
		if (out.kind === 'miss') {
			lastWrong = out.clickedId;
			if (!wrongIds.includes(out.clickedId)) wrongIds = [...wrongIds, out.clickedId];
			paint();
			return;
		}
		// Revealed after too many misses; keep the last wrong click visible too.
		if (partId && partId !== target) {
			lastWrong = partId;
			if (!wrongIds.includes(partId)) wrongIds = [...wrongIds, partId];
		}
		finish('revealed');
	}

	function reveal() {
		if (!q || finished) return;
		q.reveal();
		finish('revealed');
	}

	function next() {
		index += 1;
		// Back to the full view so the camera doesn't hint at the next answer.
		viewer.reset();
		start();
	}

	function restart() {
		queue = shuffle(ids);
		index = 0;
		history = [];
		done = false;
		viewer.reset();
		start();
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.metaKey || e.ctrlKey || e.altKey || e.target instanceof HTMLInputElement) return;
		if (finished && e.key === 'Enter') {
			e.preventDefault();
			next();
		}
	}

	onMount(() => {
		scene.pickHandler = onPick;
		const restore = scene.revealForQuiz(ids);
		if (ids.length) {
			viewer.reset(false);
			start();
		}
		return () => {
			unpeel();
			restore();
			scene.pickHandler = null;
			scene.quiz = null;
			viewer.reset(false);
		};
	});
</script>

<svelte:window {onkeydown} />
<svelte:head><title>Find · Anatomy Quiz Tools</title></svelte:head>

<div class="overlay">
	{#if target && !done}
		<div class="prompt" role="status">
			<Crosshair size={18} aria-hidden="true" />
			<span>Find the <strong>{partName(target)}</strong></span>
			<span class="miss-dots" aria-label="{misses} of {maxMisses} misses">
				{#each Array.from({ length: maxMisses }, (_, i) => i) as i (i)}<i class:on={i < misses}></i>{/each}
			</span>
		</div>
		{#if lastWrong && !finished}
			<div class="toast wrong" role="status">That’s the {partName(lastWrong)}. Try again.</div>
		{:else if finished === 'found'}
			<div class="toast ok" role="status">Found it{misses ? ` after ${misses} miss${misses === 1 ? '' : 'es'}` : ' on the first try'}.</div>
		{:else if finished === 'revealed'}
			<div class="toast reveal" role="status">Here it is, highlighted in amber.</div>
		{/if}
		<p class="hint">
			<MousePointerClick size={14} aria-hidden="true" />Click a part to answer. Shift-click hides a part that’s in the way. Faded parts are outside this quiz.
		</p>
		{#if peeled.length}
			<button class="btn unpeel" onclick={() => unpeel()}>
				<EyeOff size={16} aria-hidden="true" />Show {peeled.length} hidden part{peeled.length === 1 ? '' : 's'}
			</button>
		{/if}
	{/if}
</div>

<QuizPanel title="Find" subtitle="{ids.length} part{ids.length === 1 ? '' : 's'} · reveal after {maxMisses} miss{maxMisses === 1 ? '' : 'es'}">
	{#snippet header()}
		{#if ids.length}
			<div class="score">
				<div><strong>{firstTry}</strong><span>first try</span></div>
				<div><strong>{history.length}</strong><span>answered</span></div>
				<div><strong>{remaining}</strong><span>left to nail</span></div>
			</div>
		{/if}
	{/snippet}

	{#if !ids.length}
		<EmptyScope />
	{:else if done}
		<div class="done">
			<h1>Round complete</h1>
			<p>You found {firstTry} of {history.length} on the first try. Missed parts were asked again until you found them.</p>
			<div class="row">
				<button class="btn btn-primary" onclick={restart}>Play again</button>
				<a class="btn" href={resolve('/quiz')}>New quiz</a>
			</div>
		</div>
	{:else if target}
		<span class="eyebrow">Question {index + 1} of {queue.length}</span>
		<h1>Click the {partName(target)} in the viewer.</h1>

		{#if !finished}
			<button class="btn show" onclick={reveal}><Eye size={16} aria-hidden="true" />Show me</button>
		{:else}
			<Feedback
				ok={finished === 'found' && misses === 0}
				title={finished === 'found' ? (misses ? 'Found it' : 'Found it on the first try') : 'Revealed'}
			>
				<p class="path">{partPath(target)}</p>
				{#if finished !== 'found' || misses}<p>It will come back later in this round.</p>{/if}
				<button class="btn next" onclick={next}>Next <kbd>Enter</kbd></button>
			</Feedback>
		{/if}

		{#if history.length}
			<div class="history">
				<h2>This round</h2>
				<ul>
					{#each history as h, i (i)}
						<li>
							{#if h.result === 'first'}<Check size={16} class="ok" aria-label="First try" />
							{:else}<X size={16} class="bad" aria-label="Missed" />{/if}
							<span class="grow">{partName(h.id)}</span>
							<span class="meta">
								{h.result === 'first' ? 'first try' : h.result === 'found' ? `${h.misses} miss${h.misses === 1 ? '' : 'es'}` : 'revealed'}
							</span>
						</li>
					{/each}
				</ul>
			</div>
		{/if}
	{/if}
</QuizPanel>

<style>
	.overlay {
		grid-area: viewer;
		position: relative;
		pointer-events: none;
		z-index: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		padding-top: 16px;
	}
	.prompt {
		pointer-events: auto;
		display: inline-flex;
		align-items: center;
		gap: 10px;
		height: 48px;
		padding: 0 20px;
		border-radius: 24px;
		background: var(--panel);
		border: 1px solid var(--border);
		font-size: 16px;
		box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
	}
	.prompt :global(svg) {
		color: var(--accent);
	}
	.prompt strong {
		font-family: var(--font-display);
	}
	.miss-dots {
		display: flex;
		gap: 5px;
		margin-left: 6px;
	}
	.miss-dots i {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: var(--border);
	}
	.miss-dots i.on {
		background: var(--wrong);
	}
	.toast {
		padding: 8px 14px;
		border-radius: var(--radius);
		font-size: 13px;
		border: 1px solid;
	}
	.toast.wrong {
		background: var(--wrong-bg);
		border-color: var(--wrong-border);
		color: var(--wrong-text);
	}
	.toast.ok {
		background: var(--accent-bg);
		border-color: var(--accent-border);
		color: var(--accent);
	}
	.toast.reveal {
		background: var(--panel);
		border-color: var(--highlight);
		color: var(--highlight-soft);
	}
	.hint {
		position: absolute;
		left: 16px;
		bottom: 16px;
		margin: 0;
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		color: var(--faint);
	}

	.unpeel {
		pointer-events: auto;
		position: absolute;
		right: 16px;
		top: 16px;
		background: var(--panel);
	}

	.score {
		padding: 0 24px 14px;
		border-bottom: 1px solid var(--border);
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
	}
	.score div {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.score strong {
		font-family: var(--font-display);
		font-size: 20px;
	}
	.score span {
		font-size: 12px;
		color: var(--muted);
	}
	.eyebrow {
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--faint);
	}
	h1 {
		margin: -8px 0 0;
		font-family: var(--font-display);
		font-size: 24px;
		font-weight: 600;
		line-height: 1.25;
	}
	.show {
		align-self: flex-start;
		height: 40px;
	}
	:global(.fb) p {
		margin: 0;
	}
	.path {
		font-size: 12px;
		color: var(--faint);
	}
	.next {
		align-self: flex-start;
		margin-top: 4px;
		height: 44px;
		padding: 0 18px;
		border: none;
		background: var(--text);
		color: var(--bg);
		font-weight: 600;
		font-size: 14px;
	}
	kbd {
		font-family: inherit;
		font-size: 11px;
		padding: 2px 6px;
		border-radius: 4px;
		background: rgba(0, 0, 0, 0.12);
	}
	.history {
		margin-top: auto;
		padding-top: 16px;
		border-top: 1px solid var(--border);
	}
	.history h2 {
		margin: 0 0 10px;
		font-size: 13px;
		font-weight: 600;
	}
	.history ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
		font-size: 13px;
	}
	.history li {
		display: flex;
		align-items: center;
		gap: 10px;
		color: var(--text-2);
	}
	.history :global(.ok) {
		color: var(--accent);
	}
	.history :global(.bad) {
		color: var(--wrong);
	}
	.grow {
		flex: 1;
	}
	.meta {
		font-size: 12px;
		color: var(--faint);
	}
	.done {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 12px;
		color: var(--text-2);
	}
	.done h1 {
		margin: 0;
	}
	.done p {
		margin: 0;
	}
	.row {
		display: flex;
		gap: 8px;
	}
</style>
