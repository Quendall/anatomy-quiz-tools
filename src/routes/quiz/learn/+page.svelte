<script lang="ts">
	import { resolve } from '$app/paths';
	import { Camera, RotateCcw } from '@lucide/svelte';
	import { onMount, tick } from 'svelte';
	import EmptyScope from '#lib/components/EmptyScope.svelte';
	import Feedback from '#lib/components/Feedback.svelte';
	import QuizPanel from '#lib/components/QuizPanel.svelte';
	import { partName, partPath } from '#lib/data/systems.ts';
	import { LearnSession, newProgress, type Counts, type ItemProgress, type Stage } from '#lib/quiz/learn.ts';
	import { isCorrect, matchAnswer, type MatchResult } from '#lib/quiz/matching.ts';
	import type { QuizItem } from '#lib/quiz/types.ts';
	import { allItems, quiz } from '#lib/state/quiz.svelte.ts';
	import { scene } from '#lib/state/scene.svelte.ts';
	import { viewer } from '#lib/viewer/api.ts';

	const items = quiz.items;
	const opts = { threshold: quiz.settings.threshold };
	const fuzzy = quiz.settings.fuzzy;
	// Distractors come from the study set, topped up from the whole catalog when it is tiny.
	const session = new LearnSession(items, opts, quiz.loadLearnProgress());
	if (items.length < 4) session.choicePool = allItems();

	let current = $state<QuizItem | null>(null);
	let stage = $state<Stage>('choice');
	let progress = $state<ItemProgress>(newProgress());
	let choices = $state<string[]>([]);
	let picked = $state<number | null>(null);
	let typed = $state('');
	let result = $state<'right' | 'wrong' | 'skip' | null>(null);
	let match = $state<MatchResult | null>(null);
	let counts = $state<Counts>(session.counts());
	let upcoming = $state<{ id: string; inTurns: number }[]>([]);
	let done = $state(false);
	let before: ItemProgress | null = null;
	let input = $state<HTMLInputElement>();
	/** Parts outside the study set are faded out (e.g. muscles during a bone quiz). */
	const scope = new Set(items.map((i) => i.id));

	function show(item: QuizItem) {
		scene.quiz = {
			highlights: [{ partId: item.id, tone: 'target' }],
			dimOthers: true,
			scope,
			hoverable: false
		};
		viewer.focusPart(item.id);
	}

	async function next() {
		const item = session.next();
		result = null;
		picked = null;
		typed = '';
		match = null;
		if (!item) {
			done = true;
			current = null;
			scene.quiz = null;
			viewer.reset();
			return;
		}
		current = item;
		progress = session.progress[item.id];
		// Mastered parts that come back for review are asked in written form.
		stage = progress.stage === 'mastered' ? 'typed' : progress.stage;
		choices = stage === 'choice' ? session.choicesFor(item) : [];
		show(item);
		if (stage === 'typed') {
			await tick();
			input?.focus();
		}
	}

	function record(correct: boolean) {
		if (!current) return;
		before = { ...session.progress[current.id] };
		progress = session.answer(current.id, correct);
		quiz.saveLearnProgress(session.progress);
		counts = session.counts();
		upcoming = session.scheduler.upcoming();
		scene.quiz = {
			highlights: [{ partId: current.id, tone: correct ? 'correct' : 'target' }],
			dimOthers: true,
			scope,
			hoverable: false
		};
	}

	function pick(i: number) {
		if (result || !current) return;
		picked = i;
		const ok = choices[i] === current.name;
		result = ok ? 'right' : 'wrong';
		record(ok);
	}

	function submit(e?: SubmitEvent) {
		e?.preventDefault();
		if (result) return void next();
		if (!current || !typed.trim()) return;
		match = matchAnswer(typed, current.name, { fuzzy });
		const ok = isCorrect(match);
		result = ok ? 'right' : 'wrong';
		record(ok);
	}

	function dontKnow() {
		if (result || !current) return;
		result = 'skip';
		record(false);
	}

	/** Typed answer was marked wrong but the learner knows it was right (e.g. a synonym). */
	function override() {
		if (!current || !before) return;
		session.progress[current.id] = before;
		result = 'right';
		match = null;
		record(true);
	}

	function resetProgress() {
		quiz.saveLearnProgress({});
		for (const it of items) session.progress[it.id] = newProgress();
		counts = session.counts();
		done = false;
		next();
	}

	function onkeydown(e: KeyboardEvent) {
		if (!current || e.metaKey || e.ctrlKey || e.altKey) return;
		const inField = e.target instanceof HTMLInputElement;
		if (result && e.key === 'Enter' && !inField) {
			e.preventDefault();
			next();
		} else if (!result && stage === 'choice' && !inField && /^[1-4]$/.test(e.key)) {
			pick(Number(e.key) - 1);
		}
	}

	onMount(() => {
		const restore = scene.revealForQuiz(scope);
		if (items.length) next();
		return () => {
			restore();
			scene.quiz = null;
			viewer.reset(false);
		};
	});

	const nTotal = items.length;
	const pct = (n: number) => `${(n / Math.max(1, nTotal)) * 100}%`;
	const dots = $derived(
		Array.from({ length: opts.threshold + 1 }, (_, i) => {
			const filled =
				progress.stage === 'mastered'
					? opts.threshold + 1
					: progress.stage === 'typed'
						? opts.threshold
						: progress.streak;
			return i < filled;
		})
	);
	const choiceState = (i: number) => {
		if (!result || !current) return '';
		if (choices[i] === current.name) return 'right';
		if (i === picked) return 'wrong';
		return 'dim';
	};
	const feedbackTitle = $derived.by(() => {
		if (!current) return '';
		if (result === 'right') {
			if (progress.stage === 'mastered') return 'Correct — mastered';
			if (progress.stage === 'typed' && stage === 'choice') return 'Correct — next time, type it';
			return 'Correct';
		}
		return result === 'skip' ? `It’s the ${current.name}` : `Not quite — it’s the ${current.name}`;
	});
</script>

<svelte:window {onkeydown} />
<svelte:head><title>Learn · Anatomy Quiz Tools</title></svelte:head>

<div class="overlay">
	{#if current}
		<span class="chip"><Camera size={14} aria-hidden="true" />Camera framed on the highlighted part</span>
		<button class="btn reframe" onclick={() => current && viewer.focusPart(current.id)}>
			<RotateCcw size={16} aria-hidden="true" />Re-frame
		</button>
		<p class="hint">You can orbit and zoom while answering. Labels are hidden during the quiz.</p>
	{/if}
</div>

<QuizPanel title="Learn" subtitle="{nTotal} part{nTotal === 1 ? '' : 's'}">
	{#snippet header()}
		{#if nTotal}
			<div class="progress">
				<div class="bar" role="img" aria-label="{counts.mastered} mastered, {counts.learning} learning, {counts.new} new">
					<span class="m" style:width={pct(counts.mastered)}></span>
					<span class="l" style:width={pct(counts.learning)}></span>
				</div>
				<div class="legend">
					<span><i class="m"></i>Mastered {counts.mastered}</span>
					<span><i class="l"></i>Learning {counts.learning}</span>
					<span><i class="n"></i>New {counts.new}</span>
				</div>
			</div>
		{/if}
	{/snippet}

	{#if !nTotal}
		<EmptyScope />
	{:else if done}
		<div class="done">
			<h1>All {nTotal} parts mastered</h1>
			<p>Nice work. Reset to go through this set again, or pick a new set.</p>
			<div class="row">
				<button class="btn btn-primary" onclick={resetProgress}>Study again</button>
				<a class="btn" href={resolve('/quiz')}>New quiz</a>
			</div>
		</div>
	{:else if current}
		<div class="q-head">
			<span class="eyebrow">{stage === 'choice' ? 'Multiple choice' : 'Written'}</span>
			<span class="dots" aria-label="Progress on this part">
				{#each dots as on, i (i)}<i class:on></i>{/each}
			</span>
		</div>
		<h1>Name the highlighted structure.</h1>

		{#if stage === 'choice'}
			<div class="choices">
				{#each choices as c, i (c)}
					<button class="choice {choiceState(i)}" disabled={!!result} onclick={() => pick(i)}>
						<span class="key">{i + 1}</span>
						<span class="grow">{c}</span>
						{#if result && c === current.name}<span class="tag ok">Correct</span>{/if}
						{#if result && i === picked && c !== current.name}<span class="tag bad">Your answer</span>{/if}
					</button>
				{/each}
			</div>
		{:else}
			<form class="typed" onsubmit={submit}>
				<label for="answer">{progress.stage === 'mastered' ? 'Review: type the name.' : 'You know this one in multiple choice — now type it.'}</label>
				<div class="row">
					<input
						id="answer"
						bind:this={input}
						bind:value={typed}
						readonly={!!result}
						class={result === 'right' ? 'ok' : result ? 'bad' : ''}
						autocomplete="off"
						spellcheck="false"
						placeholder="Type the name"
					/>
					{#if !result}<button class="btn btn-primary check" type="submit">Check</button>{/if}
				</div>
				{#if !result}
					<button type="button" class="link" onclick={dontKnow}>Don’t know?</button>
				{/if}
			</form>
		{/if}

		{#if result}
			<Feedback ok={result === 'right'} title={feedbackTitle}>
				{#if result === 'right' && match === 'close'}
					<p>Accepted with a small typo. Spelling: <strong>{current.name}</strong></p>
				{:else if result === 'wrong' && stage === 'choice' && picked !== null}
					<p>You picked {choices[picked]}. {current.name} will come back within the next few questions.</p>
				{:else if result !== 'right'}
					<p>{current.name} will come back within the next few questions.</p>
				{/if}
				<p class="path">{partPath(current.id)}</p>
				{#if result === 'wrong' && stage === 'typed'}
					<button class="link warn" onclick={override}>Override: I was correct</button>
				{/if}
				<button class="btn next" onclick={next}>Continue <kbd>Enter</kbd></button>
			</Feedback>
		{/if}

		{#if upcoming.length}
			<div class="upcoming">
				<h2>Coming up <span>Missed parts return sooner</span></h2>
				<ul>
					{#each upcoming.slice(0, 5) as u (u.id)}
						<li>
							<span class="grow">{partName(u.id)}</span>
							<span class="miss">missed {session.progress[u.id]?.misses}×</span>
							<span class="when">in {u.inTurns}</span>
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
	}
	.overlay > * {
		pointer-events: auto;
	}
	.chip {
		position: absolute;
		left: 16px;
		top: 16px;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		height: 32px;
		padding: 0 12px;
		border-radius: 16px;
		background: var(--panel);
		border: 1px solid var(--border);
		font-size: 12px;
		color: var(--text-2);
	}
	.chip :global(svg) {
		color: var(--accent);
	}
	.reframe {
		position: absolute;
		right: 16px;
		top: 16px;
		background: var(--panel);
	}
	.hint {
		position: absolute;
		left: 16px;
		bottom: 16px;
		margin: 0;
		font-size: 12px;
		color: var(--faint);
	}

	.progress {
		padding: 0 24px 14px;
		border-bottom: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.bar {
		display: flex;
		height: 8px;
		border-radius: 4px;
		overflow: hidden;
		background: var(--panel-2);
	}
	.bar span {
		transition: width 0.3s;
	}
	.m {
		background: var(--accent);
	}
	.l {
		background: var(--highlight);
	}
	.n {
		background: #3a4553;
	}
	.legend {
		display: flex;
		gap: 14px;
		font-size: 12px;
		color: var(--muted);
	}
	.legend i {
		display: inline-block;
		width: 8px;
		height: 8px;
		border-radius: 2px;
		margin-right: 6px;
	}

	.q-head {
		display: flex;
		align-items: center;
	}
	.eyebrow {
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--faint);
	}
	.dots {
		margin-left: auto;
		display: flex;
		gap: 6px;
	}
	.dots i {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--border);
	}
	.dots i.on {
		background: var(--accent);
	}
	h1 {
		margin: -8px 0 0;
		font-family: var(--font-display);
		font-size: 24px;
		font-weight: 600;
		line-height: 1.25;
	}
	.choices {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.choice {
		display: flex;
		align-items: center;
		gap: 14px;
		min-height: 56px;
		padding: 8px 16px;
		border-radius: var(--radius-lg);
		border: 2px solid var(--border);
		background: var(--panel-2);
		font-size: 16px;
		text-align: left;
	}
	.choice:not(:disabled):hover {
		border-color: #4a5664;
	}
	.choice:disabled {
		cursor: default;
	}
	.choice.right {
		border-color: var(--accent);
		background: var(--accent-bg);
	}
	.choice.wrong {
		border-color: var(--wrong);
		background: var(--wrong-bg);
	}
	.choice.dim {
		opacity: 0.55;
	}
	.key {
		width: 28px;
		height: 28px;
		flex: none;
		border-radius: var(--radius-sm);
		background: var(--bg);
		color: var(--muted);
		font-size: 13px;
		font-weight: 600;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.grow {
		flex: 1;
	}
	.tag {
		font-size: 13px;
		font-weight: 600;
	}
	.tag.ok {
		color: var(--accent);
	}
	.tag.bad {
		color: var(--wrong-text);
	}
	.typed {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.typed label {
		font-size: 13px;
		color: var(--muted);
	}
	.row {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.typed input {
		flex: 1;
		min-width: 0;
		height: 52px;
		padding: 0 16px;
		border-radius: var(--radius-lg);
		border: 2px solid var(--border);
		background: var(--bg);
		font-size: 17px;
		outline: none;
	}
	.typed input:focus {
		border-color: var(--accent);
	}
	.typed input.ok {
		border-color: var(--accent);
	}
	.typed input.bad {
		border-color: var(--wrong);
	}
	.check {
		height: 52px;
		padding: 0 20px;
		font-size: 15px;
	}
	.link {
		align-self: flex-start;
		padding: 0;
		height: 32px;
		border: none;
		background: transparent;
		color: var(--muted);
		font-size: 13px;
		text-decoration: underline;
	}
	.link.warn {
		color: var(--wrong-text);
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
	.upcoming {
		margin-top: auto;
		padding-top: 16px;
		border-top: 1px solid var(--border);
	}
	.upcoming h2 {
		margin: 0 0 10px;
		font-size: 13px;
		font-weight: 600;
	}
	.upcoming h2 span {
		font-weight: 400;
		font-size: 12px;
		color: var(--faint);
		margin-left: 6px;
	}
	.upcoming ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
		font-size: 13px;
	}
	.upcoming li {
		display: flex;
		gap: 10px;
		color: var(--text-2);
	}
	.miss {
		font-size: 12px;
		color: var(--wrong-text);
	}
	.when {
		width: 44px;
		text-align: right;
		font-size: 12px;
		color: var(--faint);
	}
	.done h1 {
		margin: 0 0 8px;
	}
	.done p {
		color: var(--text-2);
		margin: 0 0 16px;
	}
</style>
