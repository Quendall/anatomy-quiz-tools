import { BufferAttribute, type Mesh } from 'three';

/**
 * Lets a mesh made of several small blobs (a part such as "Intercostal nodes" is one mesh
 * holding a dozen node spheres) grow each blob about its own center, so the nodes get
 * bigger without drifting apart. Returns a function that applies a scale (1 = true size).
 */
export function scalableBlobs(mesh: Mesh): (scale: number) => void {
	const geo = mesh.geometry;
	const src = geo.getAttribute('position');
	const n = src.count;

	// Meshopt-compressed models store positions as quantized integers; work in floats.
	const orig = new Float32Array(n * 3);
	for (let i = 0; i < n; i++) {
		orig[i * 3] = src.getX(i);
		orig[i * 3 + 1] = src.getY(i);
		orig[i * 3 + 2] = src.getZ(i);
	}
	const pos = new BufferAttribute(orig.slice(), 3);
	geo.setAttribute('position', pos);

	// Union-find: vertices of one triangle belong together, and so do vertices at the same
	// spot (a sphere whose seams were not welded is still one blob).
	const parent = new Int32Array(n).map((_, i) => i);
	const find = (i: number): number => {
		while (parent[i] !== i) i = parent[i] = parent[parent[i]];
		return i;
	};
	const join = (a: number, b: number) => {
		const ra = find(a);
		const rb = find(b);
		if (ra !== rb) parent[ra] = rb;
	};
	const index = geo.index;
	const triCount = index ? index.count : n;
	for (let t = 0; t < triCount; t += 3) {
		const a = index ? index.getX(t) : t;
		join(a, index ? index.getX(t + 1) : t + 1);
		join(a, index ? index.getX(t + 2) : t + 2);
	}
	const seen = new Map<string, number>();
	for (let i = 0; i < n; i++) {
		const k = `${orig[i * 3].toFixed(6)},${orig[i * 3 + 1].toFixed(6)},${orig[i * 3 + 2].toFixed(6)}`;
		const j = seen.get(k);
		if (j === undefined) seen.set(k, i);
		else join(i, j);
	}

	// Center of each blob: the middle of its bounding box.
	const lo = new Map<number, number[]>();
	const hi = new Map<number, number[]>();
	for (let i = 0; i < n; i++) {
		const r = find(i);
		const l = lo.get(r) ?? [Infinity, Infinity, Infinity];
		const h = hi.get(r) ?? [-Infinity, -Infinity, -Infinity];
		for (let k = 0; k < 3; k++) {
			l[k] = Math.min(l[k], orig[i * 3 + k]);
			h[k] = Math.max(h[k], orig[i * 3 + k]);
		}
		lo.set(r, l);
		hi.set(r, h);
	}
	const center = new Float32Array(n * 3);
	for (let i = 0; i < n; i++) {
		const r = find(i);
		const l = lo.get(r)!;
		const h = hi.get(r)!;
		for (let k = 0; k < 3; k++) center[i * 3 + k] = (l[k] + h[k]) / 2;
	}

	let current = 1;
	return (scale: number) => {
		if (scale === current) return;
		current = scale;
		const out = pos.array as Float32Array;
		for (let i = 0; i < n * 3; i++) out[i] = center[i] + (orig[i] - center[i]) * scale;
		pos.needsUpdate = true;
		geo.computeBoundingBox();
		// Raycasting checks the bounding sphere first; these meshes have no BVH.
		geo.computeBoundingSphere();
	};
}
