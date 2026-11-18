/**
 * Versioned localStorage wrapper. Every access is guarded: storage can be missing
 * (private windows, blocked site data), full, or hold data from an older version.
 */
const PREFIX = 'aqt:';

interface Envelope<T> {
	v: number;
	data: T;
}

export interface StorageLike {
	getItem(k: string): string | null;
	setItem(k: string, v: string): void;
	removeItem(k: string): void;
}

function storage(): StorageLike | null {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage;
	} catch {
		return null;
	}
}

export function load<T>(key: string, version: number, fallback: T, store = storage()): T {
	if (!store) return fallback;
	try {
		const raw = store.getItem(PREFIX + key);
		if (!raw) return fallback;
		const env = JSON.parse(raw) as Envelope<T>;
		return env && env.v === version ? env.data : fallback;
	} catch {
		return fallback;
	}
}

export function save<T>(key: string, version: number, data: T, store = storage()): boolean {
	if (!store) return false;
	try {
		store.setItem(PREFIX + key, JSON.stringify({ v: version, data } satisfies Envelope<T>));
		return true;
	} catch {
		return false;
	}
}

export function remove(key: string, store = storage()) {
	try {
		store?.removeItem(PREFIX + key);
	} catch {
		/* ignore */
	}
}

/** Stable key for a quiz scope (the sorted item ids), so progress is per study set. */
export function scopeKey(ids: readonly string[]): string {
	const s = [...ids].sort().join('|');
	let h = 5381;
	for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
	return (h >>> 0).toString(36);
}
