<script lang="ts">
	import { resolve } from '$app/paths';
	import { ChevronLeft, ChevronRight, RotateCcw, Shuffle, Star } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import EmptyScope from '#lib/components/EmptyScope.svelte';
	import QuizPanel from '#lib/components/QuizPanel.svelte';
	import { partName, partPath } from '#lib/data/systems.ts';
	import { FlashcardDeck, type CardMark } from '#lib/quiz/flashcards.ts';
	import { quiz } from '#lib/state/quiz.svelte.ts';
	import { scene } from '#lib/state/scene.svelte.ts';
	import { viewer } from '#lib/viewer/api.ts';

	const ids = quiz.items.map((i) => i.id);
	/** Parts outside the study set are faded out (e.g. muscles during a bone quiz). */
	const scope = new Set(ids);
	const front = quiz.settings.front;
	let deck = new FlashcardDeck(ids, quiz.stars, quiz.settings.starredOnly);

	// The deck is a plain class; bump `version` after mutating it so derived values update.
	let version = $state(0);
	let flipped = $state(false);
	const refresh = () => version++;

	const view = $derived.by(() => {
		void version;
		return {
			current: deck.current,
			position: deck.index + 1,
			total: deck.order.length,
			starredOnly: deck.starredOnly,
			unique: [...new Set(deck.order)],
			marks: { ...deck.marks }
		};
	});
	const current = $derived(view.current);
	const position = $derived(view.position);
	const total = $derived(view.total);
	const starredOnly = $derived(view.starredOnly);
	const unique = $derived(view.unique);
	const marks = $derived(view.marks);
	const known = $derived(unique.filter((id) => marks[id] === 'know').length);
	const learning = $derived(unique.filter((id) => marks[id] === 'learning').length);
	const done = $derived(unique.length > 0 && known === unique.length);
	const starredCount = $derived(ids.filter((id) => quiz.stars.has(id)).length);

	/** Sync the viewer with the card: highlight the part when it is part of what's showing. */
	function showCard() {
		const id = current;
		const reveal = front === 'model' || flipped;
		if (!id || done) {
			scene.quiz = null;
			viewer.reset();
			return;
		}
		if (reveal) {
			scene.quiz = {
				highlights: [{ partId: id, tone: 'target' }],
				dimOthers: true,
				scope,
				hoverable: false
			};
		} else {
			scene.quiz = { highlights: [], dimOthers: false, scope, hoverable: false };
		}
		// Move the camera when a new card appears (3D front) or when the name card is flipped.
		if (reveal && (front === 'model' ? !flipped : true)) viewer.focusPart(id);
		else if (!reveal) viewer.reset();
	}

	function flip() {
		if (!current) return;
		flipped = !flipped;
		if (front === 'name') showCard();
	}

	function go(delta: number) {
		deck.go(delta);
		flipped = false;
		refresh();
		showCard();
	}

	function mark(m: CardMark) {
		if (!current) return;
		deck.mark(m);
		flipped = false;
		refresh();
		showCard();
	}

	function star() {
		if (!current) return;
		deck.toggleStar(current);
		quiz.saveStars();
		refresh();
		if (deck.starredOnly) showCard();
	}

	function setFilter(on: boolean) {
		if (on === deck.starredOnly) return;
		deck.setStarredOnly(on);
		quiz.update({ starredOnly: on });
		flipped = false;
		refresh();
		showCard();
	}

	function restart() {
		deck = new FlashcardDeck(ids, quiz.stars, deck.starredOnly);
		flipped = false;
		refresh();
		showCard();
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.metaKey || e.ctrlKey || e.altKey || e.target instanceof HTMLInputElement) return;
		if (!current || done) return;
		const k = e.key;
		if (k === ' ') {
			e.preventDefault();
			flip();
		} else if (k === 'ArrowLeft') go(-1);
		else if (k === 'ArrowRight') go(1);
		else if (k === 's' || k === 'S') star();
		else if (k === '1') mark('learning');
		else if (k === '2') mark('know');
		else return;
		e.preventDefault();
	}

	onMount(() => {
		const restore = scene.revealForQuiz(scope);
		showCard();
		return () => {
			restore();
			scene.quiz = null;
			viewer.reset(false);
		};
	});

	const isStarred = $derived(current ? quiz.stars.has(current) : false);
</script>

<svelte:window {onkeydown} />
<svelte:head><title>Flashcards · Anatomy Quiz Tools</title></svelte:head>

<div class="overlay">
	{#if current && !done && (front === 'model' || flipped)}
		<button class="btn reframe" onclick={() => current && viewer.focusPart(current)}>
			<RotateCcw size={16} aria-hidden="true" />Re-frame
		</button>
	{/if}
	<p class="hint">Space flips · ← → move between cards · S stars · 1 Still learning · 2 Know</p>
</div>

<QuizPanel title="Flashcards" subtitle="{ids.length} part{ids.length === 1 ? '' : 's'} · front: {front === 'model' ? '3D view' : 'name'}">
	{#snippet header()}
		{#if ids.length}
			<div class="tools">
				<div class="seg" role="group" aria-label="Which cards">
					<button class:on={!starredOnly} aria-pressed={!starredOnly} onclick={() => setFilter(false)}>All {ids.length}</button>
					<button class:on={starredOnly} aria-pressed={starredOnly} onclick={() => setFilter(true)}>
						<Star size={14} aria-hidden="true" />Starred {starredCount}
					</button>
				</div>
				<span class="tally">
					<span class="k">Know {known}</span>
					<span class="l">Learning {learning}</span>
				</span>
			</div>
		{/if}
	{/snippet}

	{#if !ids.length}
		<EmptyScope />
	{:else if !current}
		<div class="empty">
			<p>No starred cards in this set yet. Star cards with <Star size={14} aria-label="the star button" /> or press S.</p>
			<button class="btn btn-primary" onclick={() => setFilter(false)}>Show all cards</button>
		</div>
	{:else if done}
		<div class="done">
			<h1>You know all {unique.length} cards</h1>
			<p>Shuffle to go through them again.</p>
			<div class="row">
				<button class="btn btn-primary" onclick={restart}><Shuffle size={16} aria-hidden="true" />Shuffle and restart</button>
				<a class="btn" href={resolve('/quiz')}>New quiz</a>
			</div>
		</div>
	{:else}
		<div class="counter">
			<span>Card {position} of {total}</span>
			{#if marks[current]}<span class="was {marks[current]}">Last time: {marks[current] === 'know' ? 'Know' : 'Still learning'}</span>{/if}
		</div>

		<div class="card" class:flipped>
			<button class="face" onclick={flip} aria-label={flipped ? 'Show the front' : 'Flip the card'}>
				{#if !flipped}
					{#if front === 'model'}
						<span class="eyebrow">Front</span>
						<span class="prompt">What is highlighted?</span>
						<span class="sub">Look at the viewer, then flip.</span>
					{:else}
						<span class="eyebrow">Front</span>
						<span class="name">{partName(current)}</span>
						<span class="sub">Picture where it is, then flip to see it.</span>
					{/if}
				{:else}
					<span class="eyebrow">Back</span>
					<span class="name">{partName(current)}</span>
					<span class="sub">{partPath(current)}</span>
					{#if front === 'name'}<span class="sub accent">Highlighted in the viewer</span>{/if}
				{/if}
				<span class="flip-hint"><kbd>Space</kbd> to flip</span>
			</button>
			<button
				class="star"
				class:on={isStarred}
				aria-pressed={isStarred}
				aria-label={isStarred ? 'Unstar card' : 'Star card'}
				onclick={star}
			>
				<Star size={20} fill={isStarred ? 'currentColor' : 'none'} />
			</button>
		</div>

		<div class="marks">
			<button class="btn mark learning" onclick={() => mark('learning')}>Still learning <kbd>1</kbd></button>
			<button class="btn mark know" onclick={() => mark('know')}>Know <kbd>2</kbd></button>
		</div>
		<div class="nav">
			<button class="icon-btn" aria-label="Previous card" onclick={() => go(-1)}><ChevronLeft size={20} /></button>
			<span>Still learning cards come back a few cards later.</span>
			<button class="icon-btn" aria-label="Next card" onclick={() => go(1)}><ChevronRight size={20} /></button>
		</div>
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

	.tools {
		padding: 0 24px 14px;
		border-bottom: 1px solid var(--border);
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.seg {
		display: flex;
		padding: 3px;
		border-radius: var(--radius);
		background: var(--bg);
		border: 1px solid var(--border);
	}
	.seg button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 30px;
		padding: 0 12px;
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--muted);
		font-size: 13px;
	}
	.seg button.on {
		background: var(--panel-2);
		color: var(--text);
	}
	.tally {
		margin-left: auto;
		display: flex;
		gap: 12px;
		font-size: 12px;
	}
	.tally .k {
		color: var(--accent);
	}
	.tally .l {
		color: var(--wrong-text);
	}

	.counter {
		display: flex;
		justify-content: space-between;
		font-size: 13px;
		color: var(--muted);
	}
	.was.know {
		color: var(--accent);
	}
	.was.learning {
		color: var(--wrong-text);
	}
	.card {
		position: relative;
	}
	.face {
		width: 100%;
		min-height: 260px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
		padding: 32px 24px 48px;
		border-radius: var(--radius-xl);
		border: 2px solid var(--border);
		background: var(--panel-2);
		text-align: center;
		position: relative;
		transition: border-color 0.15s;
	}
	.face:hover {
		border-color: #4a5664;
	}
	.flipped .face {
		border-color: var(--accent-border);
		background: var(--accent-bg);
	}
	.eyebrow {
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--faint);
	}
	.prompt,
	.name {
		font-family: var(--font-display);
		font-size: 26px;
		font-weight: 600;
		line-height: 1.2;
	}
	.sub {
		font-size: 13px;
		color: var(--muted);
	}
	.sub.accent {
		color: var(--accent);
	}
	.flip-hint {
		position: absolute;
		bottom: 14px;
		font-size: 12px;
		color: var(--faint);
	}
	.star {
		position: absolute;
		top: 10px;
		right: 10px;
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		border-radius: var(--radius);
		background: transparent;
		color: var(--muted);
	}
	.star:hover {
		background: var(--pressed);
	}
	.star.on {
		color: var(--highlight);
	}
	.marks {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}
	.mark {
		height: 52px;
		justify-content: center;
		font-size: 15px;
		font-weight: 600;
		border-width: 2px;
	}
	.mark.learning {
		border-color: var(--wrong-border);
		color: var(--wrong-text);
	}
	.mark.learning:hover {
		background: var(--wrong-bg);
	}
	.mark.know {
		border-color: var(--accent-border);
		color: var(--accent);
	}
	.mark.know:hover {
		background: var(--accent-bg);
	}
	.nav {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
		color: var(--faint);
		text-align: center;
	}
	.nav span {
		flex: 1;
	}
	kbd {
		font-family: inherit;
		font-size: 11px;
		padding: 2px 6px;
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.08);
		font-weight: 500;
	}
	.empty,
	.done {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 12px;
		color: var(--text-2);
	}
	.empty p,
	.done p {
		margin: 0;
	}
	.done h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 24px;
		font-weight: 600;
	}
	.row {
		display: flex;
		gap: 8px;
	}
</style>
