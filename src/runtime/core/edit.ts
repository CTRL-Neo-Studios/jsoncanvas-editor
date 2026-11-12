import { centerOf, unionBBox, type BBox, type Point } from './geometry'
import { nodeBox, normalizeCanvas, orderNodes } from './parse'
import { newId, type JSONCanvas, type JSONCanvasEdge, type JSONCanvasGroupNode, type JSONCanvasNode, type JSONCanvasUnsupportedEdge, type JSONCanvasUnsupportedNode } from './types'

type AnyNode = JSONCanvasNode | JSONCanvasUnsupportedNode
type AnyEdge = JSONCanvasEdge | JSONCanvasUnsupportedEdge

/** Where a resize starts: an edge or a corner. */
export type ResizeHandle = 'top' | 'right' | 'bottom' | 'left' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
export const RESIZE_HANDLES: readonly ResizeHandle[] = ['top', 'right', 'bottom', 'left', 'top-left', 'top-right', 'bottom-left', 'bottom-right']

/** No node gets smaller than this by resizing (world units). */
export const MIN_NODE_SIZE = 50

/** Sizes of new nodes, as Obsidian makes them. */
export const NODE_SIZE: Record<'text' | 'file', { width: number, height: number }> = {
	text: { width: 250, height: 60 },
	file: { width: 400, height: 400 },
}

/**
 * What a resize snaps by, and on which axes: the dragged edge as a line through the pointer, or the pointer itself
 * for a corner.
 */
export function resizeSnapSource(handle: ResizeHandle, p: Point, start: BBox): { source: BBox, x: boolean, y: boolean } {
	if (handle === 'top' || handle === 'bottom') return { source: { minX: start.minX, maxX: start.maxX, minY: p.y, maxY: p.y }, x: false, y: true }
	if (handle === 'left' || handle === 'right') return { source: { minX: p.x, maxX: p.x, minY: start.minY, maxY: start.maxY }, x: true, y: false }
	return { source: { minX: p.x, maxX: p.x, minY: p.y, maxY: p.y }, x: true, y: true }
}

/**
 * `start` resized by dragging `handle` to `p`, never smaller than `min`. With `aspect` (width / height), the ratio
 * is kept: a corner grows to the larger of the two sizes, an edge sets the other size; the opposite edge stays put.
 */
export function resizeBox(start: BBox, handle: ResizeHandle, p: Point, min = { width: MIN_NODE_SIZE, height: MIN_NODE_SIZE }, aspect = 0): BBox {
	const b = { ...start }
	const top = handle.startsWith('top'), bottom = handle.startsWith('bottom')
	const left = handle.endsWith('left'), right = handle.endsWith('right')
	if (top) b.minY = Math.min(b.maxY - min.height, p.y)
	if (bottom) b.maxY = Math.max(b.minY + min.height, p.y)
	if (left) b.minX = Math.min(b.maxX - min.width, p.x)
	if (right) b.maxX = Math.max(b.minX + min.width, p.x)
	if (!aspect) return b
	let w = b.maxX - b.minX, h = b.maxY - b.minY
	if ((top || bottom) && (left || right)) {
		w = Math.max(w, h * aspect)
		h = Math.max(h, w / aspect)
	}
	else if (left || right) {
		h = w / aspect
	}
	else {
		w = h * aspect
	}
	const x = left ? start.maxX - w : start.minX, y = top ? start.maxY - h : start.minY
	return { minX: x, minY: y, maxX: x + w, maxY: y + h }
}

/** `boxes` inside `from` scaled to `to`: each keeps its place and size relative to the box around them. */
export function scaleBoxes(boxes: readonly BBox[], from: BBox, to: BBox): BBox[] {
	const sx = (to.maxX - to.minX) / (from.maxX - from.minX || 1)
	const sy = (to.maxY - to.minY) / (from.maxY - from.minY || 1)
	return boxes.map(b => ({
		minX: to.minX + (b.minX - from.minX) * sx,
		minY: to.minY + (b.minY - from.minY) * sy,
		maxX: to.minX + (b.maxX - from.minX) * sx,
		maxY: to.minY + (b.maxY - from.minY) * sy,
	}))
}

/** Keeps only the larger component of a move: Shift constrains a drag to one axis. */
export const lockAxis = (d: Point): Point => (Math.abs(d.x) > Math.abs(d.y) ? { x: d.x, y: 0 } : { x: 0, y: d.y })

/** `nodes` with those in `raise` brought to the top of the z-order (groups stay first, by area). */
export function raiseNodes<T extends AnyNode>(nodes: readonly T[], raise: ReadonlySet<AnyNode>): T[] {
	return orderNodes([...nodes.filter(n => !raise.has(n)), ...nodes.filter(n => raise.has(n))])
}

/** `canvas` without `nodes`, the edges attached to them, and `edges`. A group's contents stay. */
export function removeFromCanvas(canvas: JSONCanvas, nodes: ReadonlySet<AnyNode>, edges: ReadonlySet<AnyEdge> = new Set()): JSONCanvas {
	const kept = (canvas.nodes ?? []).filter(n => !nodes.has(n))
	// An id that another node still has (duplicates) keeps its edges.
	const keptIds = new Set(kept.map(n => n.id))
	const gone = new Set([...nodes].map(n => n.id).filter(id => !keptIds.has(id)))
	return {
		...canvas,
		nodes: kept,
		edges: (canvas.edges ?? []).filter(e => !edges.has(e) && !gone.has(e.fromNode) && !gone.has(e.toNode)),
	}
}

/**
 * Adds copies of `nodes` (which must have a box) moved by `offset`, with new ids, and copies of the edges among
 * them from `edges`. Returns the canvas and the copies.
 */
export function cloneNodes(canvas: JSONCanvas, nodes: readonly AnyNode[], offset: Point, edges: readonly AnyEdge[] = canvas.edges ?? []): { canvas: JSONCanvas, clones: AnyNode[] } {
	const ids = new Map<unknown, string>()
	const clones = nodes.map((n) => {
		const box = nodeBox(n)!
		const id = newId()
		ids.set(n.id, id)
		return { ...structuredClone(n), id, x: Math.round(box.minX + offset.x), y: Math.round(box.minY + offset.y) }
	})
	const copies = edges
		.filter(e => ids.has(e.fromNode) && ids.has(e.toNode))
		.map(e => ({ ...structuredClone(e), id: newId(), fromNode: ids.get(e.fromNode)!, toNode: ids.get(e.toNode)! }))
	return {
		canvas: { ...canvas, nodes: orderNodes([...(canvas.nodes ?? []), ...clones]), edges: [...(canvas.edges ?? []), ...copies] },
		clones,
	}
}

/** The clipboard type Obsidian keeps canvas data under, so cards copy between this editor and Obsidian. */
export const CANVAS_CLIP_TYPE = 'obsidian/canvas'

/** Copied nodes, the edges among them, and the centre of the box around the nodes. */
export interface CanvasClip {
	nodes: AnyNode[]
	edges: AnyEdge[]
	center: Point
}

/** A clip of `nodes` (those with a box) and the edges among them; `undefined` when none has a box. */
export function copyClip(canvas: JSONCanvas, nodes: readonly AnyNode[]): CanvasClip | undefined {
	const boxed = nodes.filter(n => nodeBox(n))
	const box = unionBBox(boxed.map(n => nodeBox(n)!))
	if (!box) return
	const ids = new Set(boxed.map(n => n.id))
	return { nodes: boxed, edges: (canvas.edges ?? []).filter(e => ids.has(e.fromNode) && ids.has(e.toNode)), center: centerOf(box) }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * The clip in clipboard text: JSON with a `nodes` array. Pasted text is untrusted, so nodes without a box are left
 * out and the rest is normalized as a file is; `undefined` when no node is left.
 */
export function readClip(text: string): CanvasClip | undefined {
	let data: unknown
	try {
		data = JSON.parse(text)
	}
	catch {
		return
	}
	if (!isObject(data) || !Array.isArray(data.nodes)) return
	const { canvas } = normalizeCanvas({
		nodes: data.nodes.filter(n => isObject(n) && nodeBox(n as AnyNode)),
		edges: Array.isArray(data.edges) ? data.edges.filter(isObject) as AnyEdge[] : [],
	})
	const box = unionBBox(canvas.nodes!.map(n => nodeBox(n)!))
	return box && { nodes: canvas.nodes!, edges: canvas.edges!, center: centerOf(box) }
}

/** Adds `clip` to `canvas` with new ids, centred on `at`. Returns the canvas and the new nodes. */
export function pasteClip(canvas: JSONCanvas, clip: CanvasClip, at: Point): { canvas: JSONCanvas, clones: AnyNode[] } {
	return cloneNodes(canvas, clip.nodes, { x: at.x - clip.center.x, y: at.y - clip.center.y }, clip.edges)
}

/**
 * A copy of `group` with `background` set, or removed when empty. `backgroundStyle` is kept only for a background
 * with a `ratio` or `repeat` style; `cover` is the default and isn't written.
 */
export function setBackground<T extends JSONCanvasGroupNode>(group: T, background?: string, style?: 'cover' | 'ratio' | 'repeat'): T {
	const copy: JSONCanvasGroupNode = { ...group }
	if (background) copy.background = background
	else delete copy.background
	if (background && (style === 'ratio' || style === 'repeat')) copy.backgroundStyle = style
	else delete copy.backgroundStyle
	return copy as T
}
