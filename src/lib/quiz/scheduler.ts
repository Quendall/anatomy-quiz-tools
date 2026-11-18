import { defaultRng, type Rng } from './types';

export interface Schedulable {
	id: string;
	/** Relative chance of being picked when nothing is due. */
	weight: number;
}

/**
 * Picks the next item to ask.
 * 1. An item whose due turn has arrived (a recent miss) wins, oldest first.
 * 2. Otherwise weighted random.
 * The previous item is never repeated while another candidate exists.
 */
export class Scheduler {
	turn = 0;
	private due = new Map<string, number>();
	lastId: string | null = null;

	constructor(private rng: Rng = defaultRng) {}

	/** Bring `id` back after `gap` more questions (default 2, so it shows within the next 2–3). */
	requeue(id: string, gap = 2) {
		this.due.set(id, this.turn + gap);
	}

	clearDue(id: string) {
		this.due.delete(id);
	}

	next(items: readonly Schedulable[]): string | null {
		const pool = items.filter((i) => i.weight > 0);
		if (pool.length === 0) return null;
		const candidates = pool.length > 1 ? pool.filter((i) => i.id !== this.lastId) : pool;
		this.turn += 1;

		const ids = new Set(candidates.map((c) => c.id));
		const dueNow = [...this.due.entries()]
			.filter(([id, t]) => t <= this.turn && ids.has(id))
			.sort((a, b) => a[1] - b[1]);
		let pick: string;
		if (dueNow.length) {
			pick = dueNow[0][0];
			this.due.delete(pick);
		} else {
			const total = candidates.reduce((s, c) => s + c.weight, 0);
			let r = this.rng() * total;
			pick = candidates[candidates.length - 1].id;
			for (const c of candidates) {
				r -= c.weight;
				if (r < 0) {
					pick = c.id;
					break;
				}
			}
		}
		this.lastId = pick;
		return pick;
	}

	/** Items currently waiting to come back, soonest first (for the "Coming up" list). */
	upcoming(): { id: string; inTurns: number }[] {
		return [...this.due.entries()]
			.map(([id, t]) => ({ id, inTurns: Math.max(1, t - this.turn) }))
			.sort((a, b) => a.inTurns - b.inTurns);
	}
}
