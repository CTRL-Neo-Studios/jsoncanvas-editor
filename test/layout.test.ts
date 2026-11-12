import { describe, expect, it } from 'vitest'
import { alignRects, arrangeRects, distributeRects, justifyRects, type Rect } from '../src/runtime/core'

const r = (x: number, y: number, width = 100, height = 50): Rect => ({ x, y, width, height })

describe('alignRects', () => {
	const rects = [r(0, 0, 100, 50), r(300, 200, 50, 100)] // bounds 0..350 × 0..300
	it.each([
		['left', [r(0, 0, 100, 50), r(0, 200, 50, 100)]],
		['center', [r(125, 0, 100, 50), r(150, 200, 50, 100)]],
		['right', [r(250, 0, 100, 50), r(300, 200, 50, 100)]],
		['top', [r(0, 0, 100, 50), r(300, 0, 50, 100)]],
		['middle', [r(0, 125, 100, 50), r(300, 100, 50, 100)]],
		['bottom', [r(0, 250, 100, 50), r(300, 200, 50, 100)]],
	] as const)('%s', (mode, expected) => {
		expect(alignRects(rects, mode)).toEqual(expected)
	})

	it('aligns within a given box (a group\'s contents)', () => {
		expect(alignRects([r(50, 50)], 'left', { minX: 20, minY: 20, maxX: 480, maxY: 480 })).toEqual([r(20, 50)])
	})
})

describe('distributeRects', () => {
	it('evens the gaps between the first and last, which stay', () => {
		// Out of order on purpose: the result keeps the input order.
		const out = distributeRects([r(500, 0), r(0, 0), r(130, 40)], 'horizontal')
		expect(out).toEqual([r(500, 0), r(0, 0), r(250, 40)])
	})

	it('rounds the gaps', () => {
		expect(distributeRects([r(0, 0, 10), r(20, 0, 10), r(30, 0, 10), r(100, 0, 10)], 'horizontal').map(o => o.x)).toEqual([0, 33, 67, 100])
	})
})

describe('justifyRects', () => {
	it('stretches every rect across the bounds', () => {
		expect(justifyRects([r(0, 0, 100), r(50, 100, 300)], 'horizontal')).toEqual([r(0, 0, 350), r(0, 100, 350)])
	})
})

describe('arrangeRects', () => {
	// Two rows: the first two overlap vertically, the third starts below them.
	const rects = [r(400, 10), r(0, 0), r(200, 300)]

	it('row: one after another from the first, which stays', () => {
		expect(arrangeRects(rects, 'row', 20)).toEqual([r(120, 0), r(0, 0), r(240, 0)])
	})

	it('column', () => {
		expect(arrangeRects(rects, 'column', 20)).toEqual([r(0, 70), r(0, 0), r(0, 140)])
	})

	it('grid: keeps the rows, from the top-left of the bounds', () => {
		expect(arrangeRects(rects, 'grid', 20)).toEqual([r(120, 0), r(0, 0), r(0, 70)])
	})
})
