import cardiovascular from './manifest/cardiovascular.json';
import joints from './manifest/joints.json';
import muscular from './manifest/muscular.json';
import skeletal from './manifest/skeletal.json';
import visceral from './manifest/visceral.json';

export type Side = 'left' | 'right';

export interface PartDef {
	id: string;
	name: string;
	/** glTF node names; two for a left/right pair. */
	nodes: string[];
	sides: Side[] | null;
	/** Starts hidden in the viewer (e.g. the pleura, which would cover the lungs). */
	hidden?: boolean;
}

export interface GroupDef {
	id: string;
	name: string;
	/** Z-Anatomy group path, outermost first. */
	path: string[];
	/** Overrides the system color (e.g. veins are blue in the cardiovascular system). */
	color?: string;
	parts: PartDef[];
}

export interface SystemDef {
	id: string;
	name: string;
	color: string;
	model: string;
	groups: GroupDef[];
	/** False until the system has been run through tools/build-model.ps1. */
	available: boolean;
}

const pending = (id: string, name: string, color: string): SystemDef => ({
	id,
	name,
	color,
	model: `models/${id}.glb`,
	groups: [],
	available: false
});

export const SYSTEMS: SystemDef[] = [
	{ ...(skeletal as Omit<SystemDef, 'available'>), available: true },
	{ ...(joints as Omit<SystemDef, 'available'>), available: true },
	{ ...(muscular as Omit<SystemDef, 'available'>), available: true },
	{ ...(cardiovascular as Omit<SystemDef, 'available'>), available: true },
	pending('nervous', 'Nervous system & sense organs', '#F2D04B'),
	{ ...(visceral as Omit<SystemDef, 'available'>), available: true },
	pending('lymphoid', 'Lymphoid organs', '#9ADE7B')
];

export interface PartEntry {
	part: PartDef;
	group: GroupDef;
	system: SystemDef;
}

export const partIndex = new Map<string, PartEntry>();
export const nodeToPart = new Map<string, string>();
export const systemById = new Map<string, SystemDef>();

for (const system of SYSTEMS) {
	systemById.set(system.id, system);
	for (const group of system.groups) {
		for (const part of group.parts) {
			partIndex.set(part.id, { part, group, system });
			for (const n of part.nodes) nodeToPart.set(n, part.id);
		}
	}
}

export const groupKey = (systemId: string, groupId: string) => `${systemId}/${groupId}`;

export function partName(id: string): string {
	return partIndex.get(id)?.part.name ?? id;
}

/** "Skeletal system › Bones of thigh and leg" */
export function partPath(id: string): string {
	const e = partIndex.get(id);
	return e ? `${e.system.name} › ${e.group.name}` : '';
}

/** Side of a glTF node name (`femur__l` → left). */
export function nodeSide(node: string): Side | null {
	if (node.endsWith('__l')) return 'left';
	if (node.endsWith('__r')) return 'right';
	return null;
}
