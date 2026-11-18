import { SvelteSet } from 'svelte/reactivity';
import { groupKey, partIndex, SYSTEMS } from '#lib/data/systems.ts';
import { load, save } from './persist';

export type ScrollMode = 'auto' | 'orbit' | 'zoom';

export type MeshState =
	| 'hidden'
	| 'normal'
	| 'hover'
	| 'selected'
	| 'xray'
	| 'ghost'
	| 'target'
	| 'correct'
	| 'wrong';

export interface Highlight {
	partId: string;
	tone: 'target' | 'correct' | 'wrong';
}

/** What a quiz screen asks of the viewer. While set, labels are hidden. */
export interface QuizView {
	highlights: Highlight[];
	/** Half-fade everything that is not highlighted, keeping context (Learn / Flashcards). */
	dimOthers: boolean;
	/** When set, parts outside this set are faded and cannot be picked (Find). */
	scope: Set<string> | null;
	/** Show hover feedback (Find). */
	hoverable: boolean;
}

export interface LabelAnchor {
	partId: string;
	x: number;
	y: number;
}

export type PickHandler = (
	partId: string | null,
	node: string | null,
	mods: { shift: boolean }
) => void;

const SCROLL_KEY = 'scroll-mode';

/** Parts the manifests mark as hidden at first (e.g. the pleura, which covers the lungs). */
const DEFAULT_HIDDEN = [...partIndex.values()].filter((e) => e.part.hidden).map((e) => e.part.id);
const DEFAULT_HIDDEN_SET = new Set(DEFAULT_HIDDEN);

class SceneState {
	/** Only the skeleton is on at first; other systems load when first turned on. */
	hiddenSystems = new SvelteSet<string>(
		SYSTEMS.filter((s) => s.available && s.id !== 'skeletal').map((s) => s.id)
	);
	hiddenGroups = new SvelteSet<string>();
	hiddenParts = new SvelteSet<string>(DEFAULT_HIDDEN);
	/** Systems that have been shown at least once — their models are loaded lazily. */
	everShown = new SvelteSet<string>(['skeletal']);
	loaded = new SvelteSet<string>();

	selected = new SvelteSet<string>();
	focus = $state<string | null>(null);
	hovered = $state<string | null>(null);

	labelsOn = $state(true);
	xray = $state(false);
	isolate = $state(false);
	scrollMode = $state<ScrollMode>(load<ScrollMode>(SCROLL_KEY, 1, 'auto'));

	quiz = $state<QuizView | null>(null);
	labelAnchors = $state<LabelAnchor[]>([]);

	/** Set by the active route to receive clicks on the model. */
	pickHandler: PickHandler | null = null;

	isVisible(partId: string): boolean {
		const e = partIndex.get(partId);
		if (!e) return false;
		return (
			!this.hiddenSystems.has(e.system.id) &&
			!this.hiddenGroups.has(groupKey(e.system.id, e.group.id)) &&
			!this.hiddenParts.has(partId)
		);
	}

	stateOf(partId: string): MeshState {
		if (!this.isVisible(partId)) return 'hidden';
		const q = this.quiz;
		if (q) {
			const h = q.highlights.find((x) => x.partId === partId);
			if (h) return h.tone;
			// Learn/Flashcards: covering sheets (pleura…) only appear when they are the answer.
			if (q.dimOthers && DEFAULT_HIDDEN_SET.has(partId)) return 'hidden';
			if (q.scope && !q.scope.has(partId)) return 'xray';
			if (q.dimOthers) return 'ghost';
			return q.hoverable && this.hovered === partId ? 'hover' : 'normal';
		}
		if (this.selected.has(partId)) return 'selected';
		if (this.selected.size && this.isolate) return 'hidden';
		if (this.selected.size && this.xray) return 'xray';
		return this.hovered === partId ? 'hover' : 'normal';
	}

	setScrollMode(m: ScrollMode) {
		this.scrollMode = m;
		save(SCROLL_KEY, 1, m);
	}

	toggleSelect(partId: string) {
		if (this.selected.has(partId)) {
			this.selected.delete(partId);
			if (this.focus === partId) this.focus = [...this.selected].at(-1) ?? null;
		} else {
			this.selected.add(partId);
			this.focus = partId;
		}
	}

	clearSelection() {
		this.selected.clear();
		this.focus = null;
	}

	toggleIn(set: SvelteSet<string>, key: string) {
		if (set.has(key)) set.delete(key);
		else set.add(key);
	}

	showSystem(id: string, on: boolean) {
		if (on) {
			this.hiddenSystems.delete(id);
			this.everShown.add(id);
		} else this.hiddenSystems.add(id);
	}

	/**
	 * Make sure every part in a quiz scope is shown (its system loaded, its group and the
	 * part itself un-hidden). Returns a function that restores the previous visibility.
	 */
	revealForQuiz(partIds: Iterable<string>): () => void {
		const undo: (() => void)[] = [];
		const unhide = (set: SvelteSet<string>, key: string, after?: () => void) => {
			if (!set.has(key)) return;
			set.delete(key);
			undo.push(() => set.add(key));
			after?.();
		};
		for (const id of partIds) {
			const e = partIndex.get(id);
			if (!e) continue;
			unhide(this.hiddenSystems, e.system.id);
			this.everShown.add(e.system.id);
			unhide(this.hiddenGroups, groupKey(e.system.id, e.group.id));
			unhide(this.hiddenParts, id);
		}
		return () => undo.forEach((f) => f());
	}

	/** Every system and group on; parts back to their defaults (the pleura etc. stay off). */
	showAll() {
		for (const s of SYSTEMS) if (s.available) this.everShown.add(s.id);
		this.hiddenSystems.clear();
		this.hiddenGroups.clear();
		this.hiddenParts.clear();
		for (const id of DEFAULT_HIDDEN) this.hiddenParts.add(id);
	}
}

export const scene = new SceneState();
