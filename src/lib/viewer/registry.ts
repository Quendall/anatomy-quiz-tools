import { Box3, Sphere, Vector3, type Mesh } from 'three';

/** Loaded meshes, indexed for picking, framing and label anchoring. Not reactive. */
class Registry {
	byNode = new Map<string, Mesh>();
	byPart = new Map<string, Mesh[]>();
	centers = new Map<Mesh, Vector3>();

	add(mesh: Mesh, partId: string) {
		mesh.userData.partId = partId;
		this.byNode.set(mesh.name, mesh);
		const list = this.byPart.get(partId) ?? [];
		list.push(mesh);
		this.byPart.set(partId, list);
		mesh.updateWorldMatrix(true, false);
		mesh.geometry.computeBoundingBox();
		const c = mesh.geometry.boundingBox!.getCenter(new Vector3()).applyMatrix4(mesh.matrixWorld);
		this.centers.set(mesh, c);
	}

	meshes(): Mesh[] {
		return [...this.byNode.values()];
	}

	/** World-space bounding sphere of the visible meshes of these parts (null if none loaded). */
	sphereOf(partIds: string[]): Sphere | null {
		const box = new Box3();
		let any = false;
		for (const id of partIds) {
			for (const m of this.byPart.get(id) ?? []) {
				if (!m.visible) continue;
				box.expandByObject(m);
				any = true;
			}
		}
		return any ? box.getBoundingSphere(new Sphere()) : null;
	}
}

export const registry = new Registry();
