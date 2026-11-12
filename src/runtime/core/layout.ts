import { bboxOf, unionBBox, type BBox, type Rect } from './geometry'

/**
 * Layout operations of the Align menu. Each takes the rects of the nodes to arrange and returns their new rects,
 * in the same order, rounded to integers. `ref` is the box to align within: the selection's bounds (default) or,
 * for a group's contents, the group's box inset by 20.
 */

export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'
export type Axis = 'horizontal' | 'vertical'
export type ArrangeMode = 'row' | 'column' | 'grid'

/** Inset of a group's box when aligning the nodes in it. */
export const GROUP_PADDING = 20

const bounds = (rects: readonly Rect[]): BBox => unionBBox(rects.map(bboxOf)) ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 }
const rounded = (r: Rect): Rect => ({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) })

/** Moves each rect to the reference's left/center/right or top/middle/bottom; sizes stay. */
export function alignRects(rects: readonly Rect[], mode: AlignMode, ref: BBox = bounds(rects)): Rect[] {
	return rects.map((r) => {
		switch (mode) {
			case 'left': return rounded({ ...r, x: ref.minX })
			case 'center': return rounded({ ...r, x: (ref.minX + ref.maxX - r.width) / 2 })
			case 'right': return rounded({ ...r, x: ref.maxX - r.width })
			case 'top': return rounded({ ...r, y: ref.minY })
			case 'middle': return rounded({ ...r, y: (ref.minY + ref.maxY - r.height) / 2 })
			case 'bottom': return rounded({ ...r, y: ref.maxY - r.height })
		}
	})
}

/**
 * Equal gaps along an axis: the first and last rects (by position) stay, the ones between move. The span is the
 * rects' own bounds (Obsidian uses the inset group box there, which can move the last rect out of place).
 */
export function distributeRects(rects: readonly Rect[], axis: Axis): Rect[] {
	if (rects.length < 3) return rects.map(rounded)
	const [pos, size, other] = axis === 'horizontal' ? ['x', 'width', 'y'] as const : ['y', 'height', 'x'] as const
	const order = rects.map((r, i) => i).sort((a, b) => rects[a]![pos] - rects[b]![pos] || rects[a]![other] - rects[b]![other])
	const first = rects[order[0]!]!, last = rects[order.at(-1)!]!
	const span = last[pos] + last[size] - first[pos]
	const gap = (span - rects.reduce((sum, r) => sum + r[size], 0)) / (rects.length - 1)
	const out = rects.map(r => ({ ...r }))
	let at = first[pos] + first[size] + gap
	for (const i of order.slice(1, -1)) {
		out[i]![pos] = at
		at += out[i]![size] + gap
	}
	return out.map(rounded)
}

/** Stretches every rect across the reference along an axis (x and width, or y and height). */
export function justifyRects(rects: readonly Rect[], axis: Axis, ref: BBox = bounds(rects)): Rect[] {
	if (rects.length < 2) return rects.map(rounded)
	return rects.map(r => rounded(axis === 'horizontal'
		? { ...r, x: ref.minX, width: ref.maxX - ref.minX }
		: { ...r, y: ref.minY, height: ref.maxY - ref.minY }))
}

/**
 * Lines rects up with `gap` between them (Obsidian uses the grid spacing). Rows come from the current layout: by
 * top edge, a rect starting above the bottom of the row so far joins it, then each row left to right.
 * - `row` / `column`: all in one row (or column) from the first rect, which stays.
 * - `grid`: the rows stacked from the reference's top-left corner.
 */
export function arrangeRects(rects: readonly Rect[], mode: ArrangeMode, gap: number, ref: BBox = bounds(rects)): Rect[] {
	if (rects.length < 2) return rects.map(rounded)
	const out = rects.map(r => ({ ...r }))
	const rows: number[][] = []
	let limit = -Infinity
	for (const i of out.map((r, i) => i).sort((a, b) => out[a]!.y - out[b]!.y)) {
		const r = out[i]!
		if (r.y < limit) {
			rows.at(-1)!.push(i)
			limit = Math.min(limit, r.y + r.height)
		}
		else {
			rows.push([i])
			limit = r.y + r.height
		}
	}
	for (const row of rows) row.sort((a, b) => out[a]!.x - out[b]!.x)

	if (mode === 'grid') {
		let y = ref.minY
		for (const row of rows) {
			let x = ref.minX, height = 0
			for (const i of row) {
				Object.assign(out[i]!, { x, y })
				x += out[i]!.width + gap
				height = Math.max(height, out[i]!.height)
			}
			y += height + gap
		}
	}
	else {
		const flat = rows.flat()
		for (const [k, i] of flat.entries()) {
			if (!k) continue
			const prev = out[flat[k - 1]!]!
			Object.assign(out[i]!, mode === 'row'
				? { x: prev.x + prev.width + gap, y: prev.y }
				: { x: prev.x, y: prev.y + prev.height + gap })
		}
	}
	return out.map(rounded)
}
