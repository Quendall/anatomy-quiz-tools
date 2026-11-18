import { defaultRng, shuffle, type Rng } from './types';

export type CardMark = 'know' | 'learning';

/**
 * A flashcard deck. `order` is the play queue; "Still learning" puts the card back
 * a few cards later so it returns more often in this round.
 */
export class FlashcardDeck {
	order: string[];
	index = 0;
	marks: Record<string, CardMark> = {};

	constructor(
		public ids: string[],
		public starred: Set<string>,
		public starredOnly = false,
		private rng: Rng = defaultRng
	) {
		this.order = this.build();
	}

	private build(): string[] {
		const base = this.starredOnly ? this.ids.filter((id) => this.starred.has(id)) : this.ids;
		return shuffle(base, this.rng);
	}

	get current(): string | null {
		return this.order[this.index] ?? null;
	}

	setStarredOnly(on: boolean) {
		this.starredOnly = on;
		this.order = this.build();
		this.index = 0;
	}

	toggleStar(id: string): boolean {
		if (this.starred.has(id)) this.starred.delete(id);
		else this.starred.add(id);
		const on = this.starred.has(id);
		// Unstarring the current card in starred-only view drops it from the queue.
		if (this.starredOnly && !on) {
			this.order = this.order.filter((x) => x !== id);
			this.index = Math.min(this.index, Math.max(0, this.order.length - 1));
		}
		return on;
	}

	go(delta: number) {
		const n = this.order.length;
		if (!n) return;
		this.index = (this.index + delta + n) % n;
	}

	mark(m: CardMark, requeueGap = 3) {
		const id = this.current;
		if (!id) return;
		this.marks[id] = m;
		if (m === 'learning') {
			const at = Math.min(this.index + 1 + requeueGap, this.order.length);
			this.order.splice(at, 0, id);
		}
		this.go(1);
	}

	counts() {
		const v = Object.values(this.marks);
		return {
			know: v.filter((x) => x === 'know').length,
			learning: v.filter((x) => x === 'learning').length
		};
	}
}
