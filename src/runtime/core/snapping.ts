import { unionBBox, type BBox, type Point } from './geometry'

/** How close (screen px) a moved box must come to another one to snap to it. */
export const OBJECT_SNAP_DISTANCE = 15

/** The grid step (world units) at a zoom level (log2 of the scale): coarser as you zoom out. */
export function gridSpacing(zoom: number): number {
	if (zoom < -3.3) return 160
	if (zoom < -2.16) return 80
	if (zoom < -0.91) return 40
	return 20
}

/** The points boxes snap by: each one's 4 corners and centre, without duplicates. */
export function snapPoints(boxes: Iterable<BBox>): Point[] {
	const seen = new Set<string>(), points: Point[] = []
	for (const b of boxes) {
		const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2
		for (const [x, y] of [[b.minX, b.minY], [b.maxX, b.minY], [b.minX, b.maxY], [b.maxX, b.maxY], [cx, cy]] as const) {
			const key = `${x},${y}`
			if (!seen.has(key)) {
				seen.add(key)
				points.push({ x, y })
			}
		}
	}
	return points
}

export interface SnapOptions {
	/** The view's scale: the snap distance is `OBJECT_SNAP_DISTANCE` screen px, and the grid follows the zoom. */
	scale: number
	/** Snap to `targets`' points (default true). */
	objects?: boolean
	/** Snap to the grid on an axis that didn't snap to an object (default true). */
	grid?: boolean
	/** Which axes may move (default both); e.g. resizing from the right edge snaps x only. */
	x?: boolean
	y?: boolean
}

/** An alignment line to draw: from `from` to `to` (one coordinate shared), through the matched `points`. */
export interface SnapGuide {
	from: Point
	to: Point
	points: Point[]
}

export interface SnapResult {
	dx: number
	dy: number
	guides: SnapGuide[]
}

type Axis = 'x' | 'y'
interface AxisMatch {
	delta: number
	/** Target coordinate → source and target points lined up on it. */
	lines: Map<number, { sources: Point[], targets: Point[] }>
}

/**
 * The offset that lines `sources` (the boxes being moved or resized, already at their unsnapped place) up with
 * `targets`: per axis, the smallest move that puts one of their snap points on a target's within the snap
 * distance; otherwise, with `grid`, the move that puts the sources' top-left corner on the grid.
 */
export function snap(sources: readonly BBox[], targets: readonly BBox[], o: SnapOptions): SnapResult {
	const union = unionBBox(sources)
	if (!union) return { dx: 0, dy: 0, guides: [] }
	const useX = o.x !== false, useY = o.y !== false
	let mx: AxisMatch | undefined, my: AxisMatch | undefined
	if (o.objects !== false) {
		const t = targetIndex(targets)
		// Duplicates among the sources' points do no harm, and every frame of a drag has new sources.
		const src = sources.flatMap(boxPoints)
		const threshold = Math.ceil(OBJECT_SNAP_DISTANCE / o.scale)
		if (useX) mx = matchAxis(src, t.points, t.x, 'x', threshold)
		if (useY) my = matchAxis(src, t.points, t.y, 'y', threshold)
	}
	let dx = mx?.delta ?? 0, dy = my?.delta ?? 0
	if (o.grid !== false) {
		const g = gridSpacing(Math.log2(o.scale))
		if (useX && !mx) dx = Math.round(union.minX / g) * g - union.minX
		if (useY && !my) dy = Math.round(union.minY / g) * g - union.minY
	}
	const guides: SnapGuide[] = []
	for (const match of [mx, my]) {
		for (const { sources: s, targets: t } of match?.lines.values() ?? []) {
			const points = [...s.map(p => ({ x: p.x + dx, y: p.y + dy })), ...t]
			guides.push({
				from: { x: Math.min(...points.map(p => p.x)), y: Math.min(...points.map(p => p.y)) },
				to: { x: Math.max(...points.map(p => p.x)), y: Math.max(...points.map(p => p.y)) },
				points,
			})
		}
	}
	return { dx, dy, guides }
}

/** A box's 4 corners and centre. */
const boxPoints = (b: BBox): Point[] => {
	const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2
	return [{ x: b.minX, y: b.minY }, { x: b.maxX, y: b.minY }, { x: b.minX, y: b.maxY }, { x: b.maxX, y: b.maxY }, { x: cx, y: cy }]
}

/** Targets' points and their sorted coordinates, per targets array: a drag snaps to the same ones every frame. */
const targetIndexes = new WeakMap<readonly BBox[], { points: Point[], x: number[], y: number[] }>()
function targetIndex(targets: readonly BBox[]) {
	let index = targetIndexes.get(targets)
	if (!index) {
		const points = snapPoints(targets)
		const sorted = (axis: Axis) => [...new Set(points.map(p => p[axis]))].sort((a, b) => a - b)
		targetIndexes.set(targets, index = { points, x: sorted('x'), y: sorted('y') })
	}
	return index
}

function matchAxis(sources: Point[], targets: Point[], coords: number[], axis: Axis, threshold: number): AxisMatch | undefined {
	if (!coords.length) return
	let best: AxisMatch | undefined
	for (const s of sources) {
		const c = nearest(coords, s[axis])
		const delta = c - s[axis]
		if (Math.abs(delta) > threshold) continue
		if (!best || Math.abs(delta) < Math.abs(best.delta)) best = { delta, lines: new Map() }
		else if (delta !== best.delta) continue
		const line = best.lines.get(c) ?? { sources: [], targets: targets.filter(p => p[axis] === c) }
		line.sources.push(s)
		best.lines.set(c, line)
	}
	return best
}

/** The value in sorted `values` closest to `v`. */
function nearest(values: number[], v: number): number {
	let lo = 0, hi = values.length - 1
	while (lo < hi) {
		const mid = (lo + hi) >> 1
		if (values[mid]! < v) lo = mid + 1
		else hi = mid
	}
	const above = values[lo]!, below = values[lo - 1]
	return below !== undefined && v - below < above - v ? below : above
}
