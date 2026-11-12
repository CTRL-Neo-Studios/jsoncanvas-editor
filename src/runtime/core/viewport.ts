import type { BBox, Point } from './geometry'

/** What the view shows: the world point at its centre, and the zoom as log2 of the scale (0 = 100%). */
export interface Viewport {
	x: number
	y: number
	zoom: number
}

/** 6.25% to 200%. */
export const MIN_ZOOM = -4
export const MAX_ZOOM = 1
/** At or below this zoom, cards show a placeholder instead of their content (Obsidian's default). */
export const ZOOM_BREAKPOINT = -1.7

export const clampZoom = (zoom: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))

/** The viewport showing `box` with 10% to spare in a `width` × `height` view, never zoomed in past 100%. */
export function fitViewport(box: BBox, width: number, height: number): Viewport {
	const scale = Math.min(1, width / ((box.maxX - box.minX) * 1.1), height / ((box.maxY - box.minY) * 1.1))
	return { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2, zoom: clampZoom(Math.log2(scale)) }
}

/**
 * `v` at another zoom. With `anchor` (screen px from the view's centre), the world point under it stays put, as
 * when zooming at the cursor; without, the centre does.
 */
export function zoomViewport(v: Viewport, zoom: number, anchor?: Point): Viewport {
	if (!anchor) return { ...v, zoom }
	const before = 2 ** v.zoom, after = 2 ** zoom
	return { x: v.x + anchor.x / before - anchor.x / after, y: v.y + anchor.y / before - anchor.y / after, zoom }
}

/** The world point at `p` (screen px from the view's centre). */
export const viewportToWorld = (v: Viewport, p: Point): Point => ({ x: v.x + p.x / 2 ** v.zoom, y: v.y + p.y / 2 ** v.zoom })

/** The part of the world a `width` × `height` view shows. */
export function viewportBBox(v: Viewport, width: number, height: number): BBox {
	const s = 2 ** v.zoom, w = width / 2 / s, h = height / 2 / s
	return { minX: v.x - w, minY: v.y - h, maxX: v.x + w, maxY: v.y + h }
}
