import { Color, DoubleSide, MeshStandardMaterial, type Material } from 'three';
import type { MeshState } from '#lib/state/scene.svelte.ts';

const AMBER = '#FBBF24';
const TEAL = '#5EEAD4';
const ORANGE = '#FB923C';

function std(color: string, extra: Partial<MeshStandardMaterial> = {}) {
	const m = new MeshStandardMaterial({ color, roughness: 0.62, metalness: 0, ...extra });
	m.side = DoubleSide;
	return m;
}

/** One shared material per state for a system (meshes swap between them). */
export function createMaterials(baseColor: string): Record<Exclude<MeshState, 'hidden'>, Material> {
	const base = new Color(baseColor);
	return {
		normal: std(baseColor),
		hover: std(baseColor, { emissive: base.clone().multiplyScalar(0.18) }),
		selected: std(AMBER, { emissive: new Color(AMBER).multiplyScalar(0.25) }),
		target: std(AMBER, { emissive: new Color(AMBER).multiplyScalar(0.45) }),
		correct: std(TEAL, { emissive: new Color(TEAL).multiplyScalar(0.3) }),
		wrong: std(ORANGE, { emissive: new Color(ORANGE).multiplyScalar(0.3) }),
		xray: std(baseColor, { transparent: true, opacity: 0.1, depthWrite: false }),
		ghost: std(baseColor, { transparent: true, opacity: 0.3, depthWrite: false })
	};
}
