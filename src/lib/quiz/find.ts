export type FindOutcome =
	| { kind: 'found'; misses: number }
	| { kind: 'miss'; clickedId: string; misses: number }
	| { kind: 'revealed'; misses: number }
	| { kind: 'ignored' };

/**
 * One Find question. Clicks are reported as quiz item ids; because left/right meshes
 * share one item, clicking either side of a paired target counts as found.
 */
export class FindQuestion {
	misses = 0;
	finished: 'found' | 'revealed' | null = null;

	constructor(
		public targetId: string,
		public maxMisses = 3
	) {}

	click(itemId: string | null): FindOutcome {
		if (this.finished || !itemId) return { kind: 'ignored' };
		if (itemId === this.targetId) {
			this.finished = 'found';
			return { kind: 'found', misses: this.misses };
		}
		this.misses += 1;
		if (this.misses >= this.maxMisses) {
			this.finished = 'revealed';
			return { kind: 'revealed', misses: this.misses };
		}
		return { kind: 'miss', clickedId: itemId, misses: this.misses };
	}

	reveal(): FindOutcome {
		if (this.finished) return { kind: 'ignored' };
		this.finished = 'revealed';
		return { kind: 'revealed', misses: this.misses };
	}

	/** First-try finds count as correct; anything else should come back later in the round. */
	get needsReview(): boolean {
		return this.finished === 'revealed' || (this.finished === 'found' && this.misses > 0);
	}
}
