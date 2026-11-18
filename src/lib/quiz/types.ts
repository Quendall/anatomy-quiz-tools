/** A quizzable structure. Left/right meshes of a paired structure are ONE item. */
export interface QuizItem {
	id: string;
	name: string;
	groupId: string;
	layerId: string;
	/** Present when the item is a bilateral pair (both sides share this item). */
	paired?: boolean;
}

export type Rng = () => number;

export const defaultRng: Rng = Math.random;

export function shuffle<T>(arr: readonly T[], rng: Rng = defaultRng): T[] {
	const a = arr.slice();
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}
