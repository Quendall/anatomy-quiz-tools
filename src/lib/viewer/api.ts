/** Camera commands for routes; the scene installs the real implementations once mounted. */
export interface ViewerApi {
	/** Smoothly frame these parts, keeping the current viewing direction. */
	frameParts(partIds: string[], opts?: { padding?: number; animate?: boolean }): void;
	/**
	 * Move the camera to look at one part from outside the body (front for anterior parts,
	 * back for posterior ones, from the side for lateral ones), with surrounding context.
	 */
	focusPart(partId: string, opts?: { padding?: number; animate?: boolean }): void;
	/** Back to the default full-body front view. */
	reset(animate?: boolean): void;
}

type Focus = { partId: string; opts?: { padding?: number; animate?: boolean } };

/** A focus requested before the 3D scene is ready; replayed when it installs. */
let pending: Focus | null = null;

const noop: ViewerApi = {
	frameParts() {},
	focusPart(partId, opts) {
		pending = { partId, opts };
	},
	reset() {
		pending = null;
	}
};

export const viewer: ViewerApi = { ...noop };

export function installViewerApi(impl: ViewerApi): () => void {
	Object.assign(viewer, impl);
	const p = pending;
	pending = null;
	if (p) impl.focusPart(p.partId, p.opts);
	return () => Object.assign(viewer, noop);
}
