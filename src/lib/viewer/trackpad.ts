import type CameraControls from 'camera-controls';
import type { ScrollMode } from '#lib/state/scene.svelte.ts';

/**
 * Trackpad-first wheel handling (camera-controls' own wheel action is disabled):
 *   two-finger scroll      → orbit
 *   pinch (ctrlKey wheel)  → zoom   (macOS and Windows precision touchpads send pinch this way)
 *   shift + scroll         → pan
 * A mouse wheel (line-mode, or large whole-number steps with no horizontal delta) zooms,
 * unless the user forced a mode in the toolbar.
 */
export function looksLikeMouseWheel(e: WheelEvent): boolean {
	if (e.deltaMode === 1) return true;
	return e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 50;
}

export function attachTrackpad(
	el: HTMLElement,
	controls: CameraControls,
	mode: () => ScrollMode,
	onChange: () => void
): () => void {
	const handler = (e: WheelEvent) => {
		e.preventDefault();
		const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
		const dx = e.deltaX * unit;
		const dy = e.deltaY * unit;
		const dist = controls.distance;

		if (e.ctrlKey) {
			// Pinch: small deltas, negative = fingers apart = zoom in.
			const amount = Math.max(-0.5, Math.min(0.5, -dy * 0.01)) * dist;
			controls.dolly(amount, true);
		} else if (e.shiftKey) {
			const k = 0.0012 * dist;
			// Shift often converts vertical scroll to deltaX; use whichever moved.
			controls.truck(dx * k, dy * k, true);
		} else {
			const m = mode();
			const zoom = m === 'zoom' || (m === 'auto' && looksLikeMouseWheel(e));
			if (zoom) {
				controls.dolly(-Math.sign(dy) * 0.12 * dist, true);
			} else {
				controls.rotate(-dx * 0.005, -dy * 0.005, true);
			}
		}
		onChange();
	};
	el.addEventListener('wheel', handler, { passive: false });
	return () => el.removeEventListener('wheel', handler);
}
