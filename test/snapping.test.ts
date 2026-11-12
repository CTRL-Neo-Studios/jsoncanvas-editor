import { describe, expect, it } from 'vitest'
import { gridSpacing, snap, type BBox } from '../src/runtime/core'

const box = (minX: number, minY: number, size = 100): BBox => ({ minX, minY, maxX: minX + size, maxY: minY + size })

describe('gridSpacing', () => {
	it.each([[0, 20], [-0.91, 20], [-0.92, 40], [-2.17, 80], [-3.31, 160], [-4, 160]])('at zoom %d is %d', (zoom, spacing) => {
		expect(gridSpacing(zoom)).toBe(spacing)
	})
})

describe('snap', () => {
	const target = box(0, 0)

	it('lines a moved box up with another and returns a guide per matched line', () => {
		const r = snap([box(7, 300)], [target], { scale: 1 })
		expect(r.dx).toBe(-7)
		// No object within reach vertically: the top snaps to the grid (300 is on it).
		expect(r.dy).toBe(0)
		expect(r.guides).toHaveLength(3) // left edges, centres, right edges
		expect(r.guides[0]).toMatchObject({ from: { x: 0, y: 0 }, to: { x: 0, y: 400 } })
	})

	it('reaches 15 screen px, so further in world units when zoomed out', () => {
		expect(snap([box(20, 300)], [target], { scale: 1, grid: false }).dx).toBe(0)
		expect(snap([box(20, 300)], [target], { scale: 0.5, grid: false }).dx).toBe(-20)
	})

	it('falls back to the grid per axis, from the top-left corner', () => {
		expect(snap([box(31, 309)], [], { scale: 1 })).toEqual({ dx: 9, dy: -9, guides: [] })
		expect(snap([box(7, 309)], [target], { scale: 1 })).toMatchObject({ dx: -7, dy: -9 })
	})

	it('leaves disabled axes and kinds alone', () => {
		expect(snap([box(7, 309)], [target], { scale: 1, x: false })).toMatchObject({ dx: 0, dy: -9 })
		expect(snap([box(7, 309)], [target], { scale: 1, objects: false, grid: false })).toEqual({ dx: 0, dy: 0, guides: [] })
	})
})
