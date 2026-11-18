import { SvelteSet } from 'svelte/reactivity';
import { partIndex, SYSTEMS } from '#lib/data/systems.ts';
import type { QuizItem } from '#lib/quiz/types.ts';
import type { ItemProgress } from '#lib/quiz/learn.ts';
import { load, save, scopeKey } from './persist.ts';

export type QuizMode = 'learn' | 'flashcards' | 'find';

export interface QuizSettings {
	/** Part ids in the study set. */
	scope: string[];
	mode: QuizMode;
	/** Learn: correct multiple-choice answers before switching to typing. */
	threshold: number;
	/** Learn: accept minor typos. */
	fuzzy: boolean;
	/** Flashcards: what the front of the card shows. */
	front: 'model' | 'name';
	starredOnly: boolean;
	/** Find: misses before the answer is revealed. */
	maxMisses: number;
}

const DEFAULTS: QuizSettings = {
	scope: [],
	mode: 'learn',
	threshold: 2,
	fuzzy: true,
	front: 'model',
	starredOnly: false,
	maxMisses: 3
};

const SETTINGS_KEY = 'quiz-settings';
const STARS_KEY = 'stars';
const V = 1;

export function toQuizItem(id: string): QuizItem | null {
	const e = partIndex.get(id);
	if (!e) return null;
	return {
		id,
		name: e.part.name,
		groupId: e.group.id,
		layerId: e.system.id,
		paired: !!e.part.sides
	};
}

/** Every available part, used to top up distractors when a study set is tiny. */
export function allItems(): QuizItem[] {
	return SYSTEMS.flatMap((s) => s.groups.flatMap((g) => g.parts.map((p) => toQuizItem(p.id)!)));
}

class QuizStore {
	settings = $state<QuizSettings>({ ...DEFAULTS, ...load<Partial<QuizSettings>>(SETTINGS_KEY, V, {}) });
	stars = new SvelteSet<string>(load<string[]>(STARS_KEY, V, []));

	/** Study-set items (unknown ids from older manifests are dropped). */
	items = $derived(
		this.settings.scope.map(toQuizItem).filter((x): x is QuizItem => x !== null)
	);

	update(patch: Partial<QuizSettings>) {
		this.settings = { ...this.settings, ...patch };
		save(SETTINGS_KEY, V, $state.snapshot(this.settings));
	}

	toggleStar(id: string) {
		if (this.stars.has(id)) this.stars.delete(id);
		else this.stars.add(id);
		this.saveStars();
	}

	/** Persist stars after the set was changed in place (e.g. by a FlashcardDeck). */
	saveStars() {
		save(STARS_KEY, V, [...this.stars]);
	}

	private progressKey() {
		return 'learn:' + scopeKey(this.settings.scope);
	}

	loadLearnProgress(): Record<string, ItemProgress> {
		return load(this.progressKey(), V, {});
	}

	saveLearnProgress(p: Record<string, ItemProgress>) {
		save(this.progressKey(), V, p);
	}
}

export const quiz = new QuizStore();
