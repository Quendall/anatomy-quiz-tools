import { Scheduler } from './scheduler';
import { defaultRng, shuffle, type QuizItem, type Rng } from './types';

export type Stage = 'choice' | 'typed' | 'mastered';

export interface ItemProgress {
	stage: Stage;
	/** Correct answers in a row at the current stage. */
	streak: number;
	misses: number;
	seen: number;
}

export interface LearnOptions {
	/** Correct multiple-choice answers needed before switching to typing. */
	threshold: number;
}

export const newProgress = (): ItemProgress => ({ stage: 'choice', streak: 0, misses: 0, seen: 0 });

/** Pure transition: the progress after answering. */
export function applyAnswer(p: ItemProgress, correct: boolean, opts: LearnOptions): ItemProgress {
	const next = { ...p, seen: p.seen + 1 };
	if (!correct) {
		next.misses += 1;
		next.streak = 0;
		// A typed miss drops back to multiple choice; a mastered miss back to typing.
		if (p.stage === 'typed') next.stage = 'choice';
		else if (p.stage === 'mastered') next.stage = 'typed';
		return next;
	}
	next.streak += 1;
	if (p.stage === 'choice' && next.streak >= opts.threshold) {
		next.stage = 'typed';
		next.streak = 0;
	} else if (p.stage === 'typed') {
		next.stage = 'mastered';
		next.streak = 0;
	}
	return next;
}

export function weightOf(p: ItemProgress): number {
	if (p.stage === 'mastered') return 0.15;
	// Unseen parts get a boost so every part is introduced early in a round.
	const fresh = p.seen === 0 ? 2 : 1;
	return fresh * (1 + 2 * p.misses) * (p.stage === 'typed' ? 1.2 : 1);
}

/**
 * Four options: the answer + 3 distractors, preferring the same group, then the same layer,
 * then anything. Names are unique.
 */
export function buildChoices(
	item: QuizItem,
	pool: readonly QuizItem[],
	rng: Rng = defaultRng,
	count = 4
): string[] {
	const used = new Set([item.name]);
	const picks: string[] = [];
	const tiers = [
		pool.filter((p) => p.groupId === item.groupId),
		pool.filter((p) => p.groupId !== item.groupId && p.layerId === item.layerId),
		pool.filter((p) => p.layerId !== item.layerId)
	];
	for (const tier of tiers) {
		for (const p of shuffle(tier, rng)) {
			if (picks.length >= count - 1) break;
			if (used.has(p.name)) continue;
			used.add(p.name);
			picks.push(p.name);
		}
	}
	return shuffle([item.name, ...picks], rng);
}

export type Counts = Record<'new' | 'learning' | 'mastered', number>;

/** A Learn round over a fixed set of items. Holds progress + scheduling; UI-agnostic. */
export class LearnSession {
	progress: Record<string, ItemProgress>;
	scheduler: Scheduler;

	constructor(
		public items: QuizItem[],
		public opts: LearnOptions,
		saved: Record<string, ItemProgress> = {},
		private rng: Rng = defaultRng
	) {
		this.progress = Object.fromEntries(items.map((i) => [i.id, saved[i.id] ?? newProgress()]));
		this.scheduler = new Scheduler(rng);
	}

	get done(): boolean {
		return this.items.every((i) => this.progress[i.id].stage === 'mastered');
	}

	next(): QuizItem | null {
		if (this.done) return null;
		const id = this.scheduler.next(
			this.items.map((i) => ({ id: i.id, weight: weightOf(this.progress[i.id]) }))
		);
		return this.items.find((i) => i.id === id) ?? null;
	}

	/** Where distractors come from; defaults to the study set. */
	choicePool: QuizItem[] | null = null;

	choicesFor(item: QuizItem): string[] {
		return buildChoices(item, this.choicePool ?? this.items, this.rng);
	}

	answer(id: string, correct: boolean): ItemProgress {
		const p = applyAnswer(this.progress[id], correct, this.opts);
		this.progress[id] = p;
		if (correct) this.scheduler.clearDue(id);
		else this.scheduler.requeue(id, 2);
		return p;
	}

	counts(): Counts {
		const c: Counts = { new: 0, learning: 0, mastered: 0 };
		for (const i of this.items) {
			const p = this.progress[i.id];
			if (p.stage === 'mastered') c.mastered++;
			else if (p.seen === 0) c.new++;
			else c.learning++;
		}
		return c;
	}
}
