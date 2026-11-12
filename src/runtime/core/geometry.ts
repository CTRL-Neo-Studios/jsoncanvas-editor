import type { CanvasEnd, CanvasSide } from './types'

export interface Point {
	x: number
	y: number
}

/** A node's own shape: top-left corner and size. */
export interface Rect {
	x: number
	y: number
	width: number
	height: number
}

/** Edges of a box; what the math below works on. */
export interface BBox {
	minX: number
	minY: number
	maxX: number
	maxY: number
}

export const SIDES: readonly CanvasSide[] = ['top', 'right', 'bottom', 'left']

export const bboxOf = ({ x, y, width, height }: Rect): BBox => ({ minX: x, minY: y, maxX: x + width, maxY: y + height })
export const rectOf = ({ minX, minY, maxX, maxY }: BBox): Rect => ({ x: minX, y: minY, width: maxX - minX, height: maxY - minY })
export const pointBox = ({ x, y }: Point): BBox => ({ minX: x, minY: y, maxX: x, maxY: y })

/** The smallest box around all of `boxes`; `undefined` for none. */
export function unionBBox(boxes: Iterable<BBox>): BBox | undefined {
	let u: BBox | undefined
	for (const b of boxes) {
		u = u
			? { minX: Math.min(u.minX, b.minX), minY: Math.min(u.minY, b.minY), maxX: Math.max(u.maxX, b.maxX), maxY: Math.max(u.maxY, b.maxY) }
			: { ...b }
	}
	return u
}

/** `b` grown by `d` on every side (negative `d` shrinks it). */
export const growBBox = (b: BBox, d: number): BBox => ({ minX: b.minX - d, minY: b.minY - d, maxX: b.maxX + d, maxY: b.maxY + d })

/** Whether `inner` lies within `outer`, touching edges included: how a group holds a node. */
export const containsBBox = (outer: BBox, inner: BBox): boolean =>
	outer.minX <= inner.minX && outer.minY <= inner.minY && outer.maxX >= inner.maxX && outer.maxY >= inner.maxY

export const intersectsBBox = (a: BBox, b: BBox): boolean =>
	a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY

export const centerOf = (b: BBox): Point => ({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 })

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

/** The midpoint of a side: the only place an edge can attach. */
export function sidePoint(b: BBox, side: CanvasSide): Point {
	switch (side) {
		case 'top': return { x: (b.minX + b.maxX) / 2, y: b.minY }
		case 'right': return { x: b.maxX, y: (b.minY + b.maxY) / 2 }
		case 'bottom': return { x: (b.minX + b.maxX) / 2, y: b.maxY }
		case 'left': return { x: b.minX, y: (b.minY + b.maxY) / 2 }
	}
}

const OPPOSITE: Record<CanvasSide, CanvasSide> = { top: 'bottom', right: 'left', bottom: 'top', left: 'right' }
export const oppositeSide = (side: CanvasSide): CanvasSide => OPPOSITE[side]

/** A box of `size` placed so the midpoint of its `side` is at `p`: a node added at the loose end of an edge. */
export function boxAtSide(p: Point, size: { width: number, height: number }, side: CanvasSide): BBox {
	const { width: w, height: h } = size
	const x = side === 'left' ? p.x : side === 'right' ? p.x - w : p.x - w / 2
	const y = side === 'top' ? p.y : side === 'bottom' ? p.y - h : p.y - h / 2
	return { minX: x, minY: y, maxX: x + w, maxY: y + h }
}

/** Outward direction of a side. */
const NORMAL: Record<CanvasSide, Point> = { top: { x: 0, y: -1 }, right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 } }

/**
 * The side of `from` that faces `to`, for an edge saved without sides: the direction between the centres,
 * against the angle of `from`'s diagonal.
 */
export function sideTowards(from: BBox, to: BBox): CanvasSide {
	const a = centerOf(from), b = centerOf(to)
	const angle = Math.atan2(b.y - a.y, b.x - a.x)
	const diagonal = Math.atan2(from.maxY - from.minY, from.maxX - from.minX)
	if (angle > -diagonal && angle <= diagonal) return 'right'
	if (angle > diagonal && angle <= Math.PI - diagonal) return 'bottom'
	if (angle > Math.PI - diagonal || angle <= -(Math.PI - diagonal)) return 'left'
	return 'top'
}

/** How close (world units) the pointer must be to a node to connect to it. */
export const CONNECT_DISTANCE = 15

/**
 * Where a dragged edge end lands among `boxes` (those within `CONNECT_DISTANCE` of the pointer): the side midpoint
 * nearest to `p`. A midpoint within `threshold` wins at once, checked top, right, bottom, left.
 */
export function nearestSide(p: Point, boxes: readonly BBox[], threshold = CONNECT_DISTANCE): { index: number, side: CanvasSide } | undefined {
	let best: { index: number, side: CanvasSide } | undefined
	let bestDistance = Infinity
	for (const [index, b] of boxes.entries()) {
		for (const side of SIDES) {
			const d = distance(p, sidePoint(b, side))
			if (d <= threshold) return { index, side }
			if (d < bestDistance) {
				bestDistance = d
				best = { index, side }
			}
		}
	}
	return best
}

/** Gap between a node and the curve; an arrowhead covers it, otherwise a straight stub does. */
export const EDGE_OFFSET = 7
const MIN_CONTROL = 70
const MAX_CONTROL = 150
/** Arrowhead polygon, tip at the origin pointing up (−y); place with `translate(point) rotate(rotation)`. */
export const ARROW_POINTS = '0,0 6.5,10.4 -6.5,10.4'
const ARROW_ROTATION: Record<CanvasSide, number> = { top: 180, right: 270, bottom: 0, left: 90 }

export interface Bezier {
	from: Point
	cp1: Point
	cp2: Point
	to: Point
}

export interface EdgeGeometry {
	/** SVG path data: the curve, plus a stub to each end without an arrow. */
	path: string
	/** The side midpoints the edge attaches to. */
	start: Point
	end: Point
	curve: Bezier
	arrows: Array<{ point: Point, rotation: number }>
	/** The curve's midpoint, where the label sits. */
	label: Point
}

const push = (p: Point, side: CanvasSide, d: number): Point => ({ x: p.x + NORMAL[side].x * d, y: p.y + NORMAL[side].y * d })

/** An edge's shape between two boxes. `fromEnd` defaults to `none`, `toEnd` to `arrow`, as in the spec. */
export function edgeGeometry(
	from: BBox, fromSide: CanvasSide, to: BBox, toSide: CanvasSide,
	fromEnd: CanvasEnd = 'none', toEnd: CanvasEnd = 'arrow',
): EdgeGeometry {
	const start = sidePoint(from, fromSide), end = sidePoint(to, toSide)
	const a = push(start, fromSide, EDGE_OFFSET), b = push(end, toSide, EDGE_OFFSET)
	const d = Math.min(Math.max(distance(a, b) / 2, MIN_CONTROL), MAX_CONTROL)
	const curve: Bezier = { from: a, cp1: push(a, fromSide, d), cp2: push(b, toSide, d), to: b }
	let path = `M${a.x},${a.y} C${curve.cp1.x},${curve.cp1.y} ${curve.cp2.x},${curve.cp2.y} ${b.x},${b.y}`
	const arrows: EdgeGeometry['arrows'] = []
	if (fromEnd === 'arrow') arrows.push({ point: start, rotation: ARROW_ROTATION[fromSide] })
	else path = `M${start.x} ${start.y} L${a.x} ${a.y} ${path}`
	if (toEnd === 'arrow') arrows.push({ point: end, rotation: ARROW_ROTATION[toSide] })
	else path = `${path} M${b.x} ${b.y} L${end.x} ${end.y}`
	return { path, start, end, curve, arrows, label: bezierPoint(curve, 0.5) }
}

export function bezierPoint({ from, cp1, cp2, to }: Bezier, t: number): Point {
	const u = 1 - t
	const w = [u * u * u, 3 * t * u * u, 3 * t * t * u, t * t * t] as const
	return {
		x: w[0] * from.x + w[1] * cp1.x + w[2] * cp2.x + w[3] * to.x,
		y: w[0] * from.y + w[1] * cp1.y + w[2] * cp2.y + w[3] * to.y,
	}
}

/** About how far `p` is from `curve`: the distance to the polyline through `samples + 1` points along it. */
export function curveDistance(curve: Bezier, p: Point, samples = 16): number {
	let best = Infinity, prev = curve.from
	for (let i = 1; i <= samples; i++) {
		const next = bezierPoint(curve, i / samples)
		best = Math.min(best, segmentDistance(p, prev, next))
		prev = next
	}
	return best
}

function segmentDistance(p: Point, a: Point, b: Point): number {
	const dx = b.x - a.x, dy = b.y - a.y, len = dx * dx + dy * dy
	const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0
	return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}
