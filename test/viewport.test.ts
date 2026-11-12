import { describe, expect, it } from 'vitest'
import { fileLabel, fitViewport, viewportBBox, viewportToWorld, zoomViewport } from '../src/runtime/core'

describe('fitViewport', () => {
	it('centres the box with 10% to spare', () => {
		expect(fitViewport({ minX: 0, minY: 0, maxX: 2000, maxY: 500 }, 1100, 1100)).toEqual({ x: 1000, y: 250, zoom: -1 })
	})

	it('never zooms in past 100% or out past 6.25%', () => {
		expect(fitViewport({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, 1000, 1000).zoom).toBe(0)
		expect(fitViewport({ minX: 0, minY: 0, maxX: 1e7, maxY: 10 }, 1000, 1000).zoom).toBe(-4)
	})
})

describe('zoomViewport', () => {
	const v = { x: 100, y: 50, zoom: 0 }
	it('keeps the world point under the anchor in place', () => {
		const anchor = { x: 300, y: -120 }
		const before = viewportToWorld(v, anchor)
		const after = zoomViewport(v, -1.3, anchor)
		expect(viewportToWorld(after, anchor).x).toBeCloseTo(before.x)
		expect(viewportToWorld(after, anchor).y).toBeCloseTo(before.y)
	})

	it('keeps the centre without an anchor', () => {
		expect(zoomViewport(v, 1)).toEqual({ x: 100, y: 50, zoom: 1 })
	})
})

it('viewportBBox spans the view in world units', () => {
	expect(viewportBBox({ x: 0, y: 0, zoom: -1 }, 800, 600)).toEqual({ minX: -800, minY: -600, maxX: 800, maxY: 600 })
})

describe('fileLabel', () => {
	it.each([
		['Notes/Welcome.md', undefined, 'Welcome'],
		['Welcome.md', '#Getting started', 'Welcome › Getting started'],
		['Untitled.canvas', undefined, 'Untitled.canvas'],
		['a/Pasted image 1.png', undefined, 'Pasted image 1.png'],
	])('%s %s → %s', (path, subpath, label) => {
		expect(fileLabel(path, subpath)).toBe(label)
	})
})
