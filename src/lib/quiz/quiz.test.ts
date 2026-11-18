import { describe, expect, it } from 'vitest';
import { Scheduler } from './scheduler';
import { allowedTypos, editDistance, isCorrect, matchAnswer, normalize } from './matching';
import {
	applyAnswer,
	buildChoices,
	LearnSession,
	newProgress,
	weightOf,
	type ItemProgress
} from './learn';
import { FlashcardDeck } from './flashcards';
import { FindQuestion } from './find';
import { load, save, scopeKey, type StorageLike } from '../state/persist';
import type { QuizItem } from './types';

/** Deterministic PRNG (mulberry32). */
function seeded(seed = 1) {
	let a = seed;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const ITEMS: QuizItem[] = [
	{ id: 'femur', name: 'Femur', groupId: 'lower', layerId: 'skel', paired: true },
	{ id: 'tibia', name: 'Tibia', groupId: 'lower', layerId: 'skel', paired: true },
	{ id: 'fibula', name: 'Fibula', groupId: 'lower', layerId: 'skel', paired: true },
	{ id: 'patella', name: 'Patella', groupId: 'lower', layerId: 'skel', paired: true },
	{ id: 'humerus', name: 'Humerus', groupId: 'upper', layerId: 'skel', paired: true },
	{ id: 'sternum', name: 'Sternum', groupId: 'axial', layerId: 'skel' },
	{ id: 'quad', name: 'Quadriceps femoris', groupId: 'thigh', layerId: 'musc', paired: true }
];

describe('scheduler', () => {
	it('never repeats the previous item when others exist', () => {
		const s = new Scheduler(seeded(3));
		const items = [
			{ id: 'a', weight: 100 },
			{ id: 'b', weight: 1 }
		];
		let prev = s.next(items);
		for (let i = 0; i < 50; i++) {
			const n = s.next(items);
			expect(n).not.toBe(prev);
			prev = n;
		}
	});

	it('brings a requeued item back within 2–3 questions', () => {
		const s = new Scheduler(seeded(7));
		const items = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, weight: 1 }));
		s.next(items);
		s.requeue('a', 2);
		const nextThree = [s.next(items), s.next(items), s.next(items)];
		expect(nextThree).toContain('a');
	});

	it('favours heavier items', () => {
		const s = new Scheduler(seeded(11));
		const items = [
			{ id: 'heavy', weight: 9 },
			{ id: 'x', weight: 1 },
			{ id: 'y', weight: 1 }
		];
		const counts: Record<string, number> = { heavy: 0, x: 0, y: 0 };
		for (let i = 0; i < 600; i++) {
			s.lastId = null; // measure raw weighting
			counts[s.next(items)!]++;
		}
		expect(counts.heavy).toBeGreaterThan(counts.x * 4);
	});
});

describe('learn progression', () => {
	const opts = { threshold: 2 };

	it('moves choice → typed after N correct, then typed → mastered', () => {
		let p = newProgress();
		p = applyAnswer(p, true, opts);
		expect(p.stage).toBe('choice');
		p = applyAnswer(p, true, opts);
		expect(p.stage).toBe('typed');
		p = applyAnswer(p, true, opts);
		expect(p.stage).toBe('mastered');
	});

	it('a miss resets the streak and drops a typed item back to choice', () => {
		let p: ItemProgress = { ...newProgress(), stage: 'typed' };
		p = applyAnswer(p, false, opts);
		expect(p).toMatchObject({ stage: 'choice', streak: 0, misses: 1 });
	});

	it('missed items weigh more; mastered items weigh little', () => {
		expect(weightOf({ ...newProgress(), misses: 2 })).toBeGreaterThan(weightOf(newProgress()));
		expect(weightOf({ ...newProgress(), stage: 'mastered' })).toBeLessThan(0.5);
	});

	it('builds 4 unique choices including the answer, same group first', () => {
		const c = buildChoices(ITEMS[0], ITEMS, seeded(5));
		expect(c).toHaveLength(4);
		expect(new Set(c).size).toBe(4);
		expect(c).toContain('Femur');
		// 3 other lower-limb bones exist, so all distractors come from that group.
		expect(c.filter((n) => ['Tibia', 'Fibula', 'Patella'].includes(n))).toHaveLength(3);
	});

	it('session reaches done when everything is mastered', () => {
		const s = new LearnSession(ITEMS.slice(0, 2), { threshold: 1 }, {}, seeded(2));
		let guard = 0;
		while (!s.done && guard++ < 50) {
			const item = s.next()!;
			s.answer(item.id, true);
		}
		expect(s.done).toBe(true);
		expect(s.counts().mastered).toBe(2);
	});
});

describe('typed answer matching', () => {
	it('normalizes case, accents, punctuation and "the"', () => {
		expect(normalize('  The Fémur! ')).toBe('femur');
	});

	it('computes transpositions as one edit', () => {
		expect(editDistance('femur', 'fmeur')).toBe(1);
	});

	it('accepts minor typos only when fuzzy is on', () => {
		expect(matchAnswer('femer', 'Femur')).toBe('wrong');
		expect(matchAnswer('femer', 'Femur', { fuzzy: true })).toBe('close');
		expect(matchAnswer('quadricep femoris', 'Quadriceps femoris', { fuzzy: true })).toBe('close');
	});

	it('does not allow typos on very short names', () => {
		expect(allowedTypos('Rib')).toBe(0);
		expect(matchAnswer('rob', 'Rib', { fuzzy: true })).toBe('wrong');
	});

	it('side words are optional unless the side is required', () => {
		expect(matchAnswer('left femur', 'Femur')).toBe('exact');
		expect(matchAnswer('femur', 'Femur', { requireSide: 'left' })).toBe('wrong-side');
		expect(isCorrect(matchAnswer('Left femur', 'Femur', { requireSide: 'left' }))).toBe(true);
		expect(matchAnswer('right femur', 'Femur', { requireSide: 'left' })).toBe('wrong-side');
	});

	it('the word "muscle" is optional', () => {
		expect(matchAnswer('deltoid', 'Deltoid muscle')).toBe('exact');
		expect(matchAnswer('levator scapulae muscle', 'Levator scapulae')).toBe('exact');
		expect(matchAnswer('deltiod', 'Deltoid muscle', { fuzzy: true })).toBe('close');
	});
});

describe('flashcards', () => {
	it('filters to starred cards and drops a card when unstarred', () => {
		const d = new FlashcardDeck(['a', 'b', 'c'], new Set(['b', 'c']), false, seeded(1));
		d.setStarredOnly(true);
		expect(d.order.sort()).toEqual(['b', 'c']);
		const cur = d.current!;
		d.toggleStar(cur);
		expect(d.order).not.toContain(cur);
	});

	it('"still learning" brings the card back later in the round', () => {
		const d = new FlashcardDeck(['a', 'b', 'c', 'd', 'e'], new Set(), false, seeded(4));
		const first = d.current!;
		d.mark('learning');
		expect(d.order.filter((x) => x === first)).toHaveLength(2);
		expect(d.counts().learning).toBe(1);
	});
});

describe('find', () => {
	it('either side of a paired part is the same item, so it counts', () => {
		const q = new FindQuestion('femur');
		expect(q.click('femur')).toEqual({ kind: 'found', misses: 0 });
		expect(q.needsReview).toBe(false);
	});

	it('reports the wrong part and reveals after N misses', () => {
		const q = new FindQuestion('sternum', 3);
		expect(q.click('humerus')).toEqual({ kind: 'miss', clickedId: 'humerus', misses: 1 });
		q.click('femur');
		expect(q.click('tibia').kind).toBe('revealed');
		expect(q.click('sternum').kind).toBe('ignored');
		expect(q.needsReview).toBe(true);
	});
});

describe('persistence', () => {
	function memory(): StorageLike {
		const m = new Map<string, string>();
		return {
			getItem: (k) => m.get(k) ?? null,
			setItem: (k, v) => void m.set(k, v),
			removeItem: (k) => void m.delete(k)
		};
	}

	it('round-trips stars and ignores other versions', () => {
		const st = memory();
		save('stars', 1, ['femur', 'tibia'], st);
		expect(load('stars', 1, [], st)).toEqual(['femur', 'tibia']);
		expect(load('stars', 2, ['fallback'], st)).toEqual(['fallback']);
	});

	it('falls back when storage throws', () => {
		const broken: StorageLike = {
			getItem: () => {
				throw new Error('blocked');
			},
			setItem: () => {
				throw new Error('blocked');
			},
			removeItem: () => {}
		};
		expect(load('x', 1, 42, broken)).toBe(42);
		expect(save('x', 1, 1, broken)).toBe(false);
	});

	it('scope keys ignore order', () => {
		expect(scopeKey(['b', 'a'])).toBe(scopeKey(['a', 'b']));
	});
});
