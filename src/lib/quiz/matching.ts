export type Side = 'left' | 'right';

const SIDE_WORDS = /\b(left|right|l|r)\b/g;
const OPTIONAL_WORDS = /\bmuscles?\b/g;

/** Lower-case, strip accents, punctuation, a leading "the" and extra spaces. */
export function normalize(s: string): string {
	return s
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, ' ')
		.replace(/\bthe\b/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

/** Optimal-string-alignment Damerau-Levenshtein distance. */
export function editDistance(a: string, b: string): number {
	const m = a.length;
	const n = b.length;
	const d: number[][] = Array.from({ length: m + 1 }, (_, i) => {
		const row = new Array<number>(n + 1).fill(0);
		row[0] = i;
		return row;
	});
	for (let j = 0; j <= n; j++) d[0][j] = j;
	for (let i = 1; i <= m; i++) {
		for (let j = 1; j <= n; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
				d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
			}
		}
	}
	return d[m][n];
}

/** Typos allowed for an answer of this length: none under 5 chars, 1 up to 9, then 2. */
export function allowedTypos(answer: string): number {
	const len = answer.replace(/\s/g, '').length;
	if (len < 5) return 0;
	if (len <= 9) return 1;
	return 2;
}

function readSide(s: string): Side | null {
	const words = normalize(s).split(' ');
	if (words.includes('left') || words.includes('l')) return 'left';
	if (words.includes('right') || words.includes('r')) return 'right';
	return null;
}

export interface MatchOptions {
	fuzzy?: boolean;
	/** When set, the typed answer must name this side. */
	requireSide?: Side | null;
	/** Extra accepted names (e.g. common synonyms). */
	aliases?: string[];
}

/**
 * A trailing "(...)" is optional, and a long one is an accepted alias:
 * "Trigeminal nerve (V)" accepts "trigeminal nerve";
 * "Lateral occipital gyrus (Middle occipital gyrus)" also accepts "middle occipital gyrus".
 */
export function parenAliases(answer: string): string[] {
	const m = /^(.+?)\s*\(([^()]+)\)$/.exec(answer.trim());
	if (!m) return [];
	return m[2].replace(/\s/g, '').length >= 5 ? [m[1], m[2]] : [m[1]];
}

export type MatchResult ='exact' | 'close' | 'wrong-side' | 'wrong';

export function matchAnswer(input: string, answer: string, opts: MatchOptions = {}): MatchResult {
	// Side words and the word "muscle(s)" are optional: "deltoid" matches "Deltoid muscle".
	const strip = (s: string) =>
		normalize(s).replace(SIDE_WORDS, ' ').replace(OPTIONAL_WORDS, ' ').replace(/\s+/g, ' ').trim();
	const typed = strip(input);
	if (!typed) return 'wrong';
	const targets = [answer, ...parenAliases(answer), ...(opts.aliases ?? [])].map(strip);

	let result: MatchResult = 'wrong';
	for (const t of targets) {
		if (typed === t) {
			result = 'exact';
			break;
		}
		if (opts.fuzzy && editDistance(typed, t) <= allowedTypos(t)) result = 'close';
	}
	if (result === 'wrong') return result;
	if (opts.requireSide && readSide(input) !== opts.requireSide) return 'wrong-side';
	return result;
}

export function isCorrect(r: MatchResult): boolean {
	return r === 'exact' || r === 'close';
}
