import { describe, expect, it } from 'vitest'
import { bboxOf, containsBBox, edgeGeometry, nearestSide, sideTowards } from '../src/runtime/core'

describe('nearestSide', () => {
	// Drops recorded in Obsidian onto a 250×120 card at (200, 250), at scale 1.
	const card = bboxOf({ x: 200, y: 250, width: 250, height: 120 })
	it.each([
		[{ x: 440, y: 309.5 }, 'right'],
		[{ x: 325, y: 255.5 }, 'top'],
		[{ x: 210, y: 359.5 }, 'left'],
		[{ x: 325, y: 309.5 }, 'top'],
	] as const)('a drop at %o lands on %s', (p, side) => {
		expect(nearestSide(p, [card])).toEqual({ index: 0, side })
	})

	it('picks the nearest midpoint across several nodes, and nothing without nodes', () => {
		const far = bboxOf({ x: 1000, y: 0, width: 100, height: 100 })
		expect(nearestSide({ x: 470, y: 310 }, [far, card])).toEqual({ index: 1, side: 'right' })
		expect(nearestSide({ x: 0, y: 0 }, [])).toBeUndefined()
	})
})

describe('sideTowards', () => {
	const wide = bboxOf({ x: -100, y: -50, width: 200, height: 100 }) // diagonal at atan2(100, 200) ≈ 26.6°
	const at = (deg: number) => {
		const r = (deg * Math.PI) / 180
		return bboxOf({ x: Math.cos(r) * 1000 - 1, y: Math.sin(r) * 1000 - 1, width: 2, height: 2 })
	}
	it.each([[0, 'right'], [20, 'right'], [30, 'bottom'], [90, 'bottom'], [150, 'bottom'], [160, 'left'], [-170, 'left'], [-30, 'top'], [-90, 'top']] as const)(
		'a node at %i° is on the %s side', (deg, side) => {
			expect(sideTowards(wide, at(deg))).toBe(side)
		},
	)
})

describe('edgeGeometry', () => {
	const a = bboxOf({ x: 100, y: 60, width: 250, height: 60 })
	const b = bboxOf({ x: 550, y: 60, width: 250, height: 60 })

	it('matches the path Obsidian draws (stub at the start, arrow at the end)', () => {
		const g = edgeGeometry(a, 'right', b, 'left')
		expect(g.path).toBe('M350 90 L357 90 M357,90 C450,90 450,90 543,90')
		expect(g.arrows).toEqual([{ point: { x: 550, y: 90 }, rotation: 90 }])
		expect(g.label).toEqual({ x: 450, y: 90 })
	})

	it('draws stubs or arrows per end', () => {
		expect(edgeGeometry(a, 'right', b, 'left', 'arrow', 'arrow').path).toBe('M357,90 C450,90 450,90 543,90')
		const none = edgeGeometry(a, 'right', b, 'left', 'none', 'none')
		expect(none.path).toBe('M350 90 L357 90 M357,90 C450,90 450,90 543,90 M543 90 L550 90')
		expect(none.arrows).toEqual([])
	})

	it('keeps the control distance between 70 and 150', () => {
		const near = bboxOf({ x: 380, y: 60, width: 100, height: 60 })
		expect(edgeGeometry(a, 'right', near, 'left').curve.cp1).toEqual({ x: 357 + 70, y: 90 })
		const far = bboxOf({ x: 2000, y: 60, width: 100, height: 60 })
		expect(edgeGeometry(a, 'right', far, 'left').curve.cp1).toEqual({ x: 357 + 150, y: 90 })
	})

	it('points arrows into the node from any side', () => {
		const below = bboxOf({ x: 100, y: 400, width: 250, height: 60 })
		expect(edgeGeometry(a, 'bottom', below, 'top', 'arrow', 'arrow').arrows).toEqual([
			{ point: { x: 225, y: 120 }, rotation: 0 },
			{ point: { x: 225, y: 400 }, rotation: 180 },
		])
	})
})

describe('containsBBox', () => {
	const group = bboxOf({ x: 0, y: 0, width: 100, height: 100 })
	it('counts a node touching the group\'s edges as inside, and one a unit out as outside', () => {
		expect(containsBBox(group, bboxOf({ x: 0, y: 0, width: 100, height: 100 }))).toBe(true)
		expect(containsBBox(group, bboxOf({ x: 1, y: 0, width: 100, height: 100 }))).toBe(false)
	})
})
