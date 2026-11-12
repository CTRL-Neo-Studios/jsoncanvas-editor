import { describe, expect, it } from 'vitest'
import { cloneNodes, copyClip, pasteClip, raiseNodes, readClip, removeFromCanvas, resizeBox, resizeSnapSource, scaleBoxes, setBackground, type BBox, type JSONCanvas } from '../src/runtime/core'

const box = (minX: number, minY: number, maxX: number, maxY: number): BBox => ({ minX, minY, maxX, maxY })

describe('resizeBox', () => {
	const start = box(0, 0, 200, 100)

	it('moves the dragged edges only', () => {
		expect(resizeBox(start, 'right', { x: 300, y: 999 })).toEqual(box(0, 0, 300, 100))
		expect(resizeBox(start, 'top-left', { x: -20, y: -30 })).toEqual(box(-20, -30, 200, 100))
	})

	it('stops at the minimum size, the opposite edge staying put', () => {
		expect(resizeBox(start, 'left', { x: 190, y: 0 })).toEqual(box(150, 0, 200, 100))
		expect(resizeBox(start, 'bottom', { x: 0, y: -500 })).toEqual(box(0, 0, 200, 50))
	})

	it('keeps an aspect ratio: corners grow to the larger size, edges set the other', () => {
		expect(resizeBox(start, 'bottom-right', { x: 400, y: 120 }, undefined, 2)).toEqual(box(0, 0, 400, 200))
		expect(resizeBox(start, 'top-left', { x: 100, y: -100 }, undefined, 2)).toEqual(box(-200, -100, 200, 100))
		expect(resizeBox(start, 'right', { x: 300, y: 0 }, undefined, 2)).toEqual(box(0, 0, 300, 150))
		expect(resizeBox(start, 'top', { x: 0, y: -100 }, undefined, 2)).toEqual(box(0, -100, 400, 100))
	})
})

it('resizeSnapSource snaps an edge as a line and a corner as a point', () => {
	const start = box(0, 0, 200, 100)
	expect(resizeSnapSource('right', { x: 250, y: 40 }, start)).toEqual({ source: box(250, 0, 250, 100), x: true, y: false })
	expect(resizeSnapSource('bottom-left', { x: 5, y: 6 }, start)).toEqual({ source: box(5, 6, 5, 6), x: true, y: true })
})

it('scaleBoxes keeps members in place relative to the box', () => {
	expect(scaleBoxes([box(0, 0, 50, 50), box(50, 50, 100, 100)], box(0, 0, 100, 100), box(10, 10, 210, 110)))
		.toEqual([box(10, 10, 110, 60), box(110, 60, 210, 110)])
})

describe('document edits', () => {
	const g = { id: 'g', type: 'group', x: 0, y: 0, width: 500, height: 500 }
	const a = { id: 'a', type: 'text', text: 'a', x: 10, y: 10, width: 100, height: 50 }
	const b = { id: 'b', type: 'text', text: 'b', x: 200, y: 10, width: 100, height: 50 }
	const c = { id: 'c', type: 'text', text: 'c', x: 600, y: 10, width: 100, height: 50 }
	const canvas: JSONCanvas = {
		nodes: [g, a, b, c],
		edges: [
			{ id: 'ab', fromNode: 'a', toNode: 'b', color: '2' },
			{ id: 'bc', fromNode: 'b', toNode: 'c' },
		],
	}

	it('raises nodes to the top, keeping groups first', () => {
		expect(raiseNodes(canvas.nodes!, new Set([a, g])).map(n => n.id)).toEqual(['g', 'b', 'c', 'a'])
	})

	it('removes nodes with their edges, but not a group\'s contents', () => {
		const out = removeFromCanvas(canvas, new Set([g, b]))
		expect(out.nodes!.map(n => n.id)).toEqual(['a', 'c'])
		expect(out.edges).toEqual([])
	})

	it('clones nodes with new ids, and the edges between them', () => {
		const { canvas: out, clones } = cloneNodes(canvas, [a, b], { x: 0, y: 100 })
		expect(clones.map(n => [n.x, n.y])).toEqual([[10, 110], [200, 110]])
		expect(clones.every(n => n.id !== 'a' && n.id !== 'b')).toBe(true)
		const copy = out.edges!.at(-1)!
		expect(out.edges).toHaveLength(3)
		expect(copy).toMatchObject({ fromNode: clones[0]!.id, toNode: clones[1]!.id, color: '2' })
	})

	it('copies nodes with the edges among them, and pastes them centred on a point with new ids', () => {
		const clip = copyClip(canvas, [a, b])!
		expect(clip.edges.map(e => e.id)).toEqual(['ab'])
		expect(clip.center).toEqual({ x: 155, y: 35 })
		const { canvas: out, clones } = pasteClip({ nodes: [] }, readClip(JSON.stringify(clip))!, { x: 0, y: 0 })
		expect(clones.map(n => [n.x, n.y, n.text])).toEqual([[-145, -25, 'a'], [45, -25, 'b']])
		expect(out.edges).toEqual([{ id: expect.any(String), fromNode: clones[0]!.id, toNode: clones[1]!.id, color: '2', fromSide: 'right', toSide: 'left' }])
		expect(out.edges![0]!.id).not.toBe('ab')
	})

	it('reads canvas data from clipboard text, leaving out nodes without a box', () => {
		expect(readClip('hello')).toBeUndefined()
		expect(readClip('{"nodes":[]}')).toBeUndefined()
		const clip = readClip('{"nodes":[{"id":"x","type":"text"},null,{"id":"y","type":"text","text":"t","x":0.4,"y":0,"width":10,"height":10}],"edges":[null]}')
		expect(clip).toEqual({ nodes: [{ id: 'y', type: 'text', text: 't', x: 0, y: 0, width: 10, height: 10 }], edges: [], center: { x: 5, y: 5 } })
	})
})

describe('setBackground', () => {
	const g = { id: 'g', type: 'group' as const, x: 0, y: 0, width: 100, height: 100, label: 'L' }

	it('appends a new background and a non-cover style', () => {
		const out = setBackground(g, 'a.png', 'repeat')
		expect(Object.keys(out)).toEqual(['id', 'type', 'x', 'y', 'width', 'height', 'label', 'background', 'backgroundStyle'])
		expect(out).toMatchObject({ background: 'a.png', backgroundStyle: 'repeat' })
		expect(g).not.toHaveProperty('background')
	})

	it('replaces a background in place and drops a stale style', () => {
		const styled = { ...g, background: 'old.png', backgroundStyle: 'ratio' as const, extra: 1 }
		const out = setBackground(styled, 'new.png', 'cover')
		expect(Object.keys(out)).toEqual(['id', 'type', 'x', 'y', 'width', 'height', 'label', 'background', 'extra'])
		expect(out.background).toBe('new.png')
		expect(setBackground(styled, 'new.png')).not.toHaveProperty('backgroundStyle')
	})

	it('removes the background with its style', () => {
		const out = setBackground({ ...g, background: 'old.png', backgroundStyle: 'repeat' as const }, undefined, 'repeat')
		expect(out).not.toHaveProperty('background')
		expect(out).not.toHaveProperty('backgroundStyle')
		expect(setBackground({ ...g, background: 'old.png' }, '')).not.toHaveProperty('background')
	})
})
