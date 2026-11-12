import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { canvasMinimap, edgeGeometry, parseCanvas, sideTowards, type BBox } from '../src/runtime/core'

const box = (minX: number, minY: number, maxX: number, maxY: number): BBox => ({ minX, minY, maxX, maxY })

it('draws a canvas small: groups, edges between existing nodes, other nodes', () => {
	const a = box(0, 0, 50, 50), b = box(150, 50, 200, 100), u = box(900, 0, 1000, 100)
	const minimap = canvasMinimap({
		nodes: [
			{ id: 'g', type: 'group', x: 0, y: 0, width: 200, height: 100, color: '1' },
			{ id: 'a', type: 'text', text: '', x: 0, y: 0, width: 50, height: 50, color: '' },
			{ id: 'b', type: 'text', text: '', x: 150, y: 50, width: 50, height: 50, color: '#ff0000' },
			{ id: 'u', type: 'custom', x: 900, y: 0, width: 100, height: 100 },
			{ id: 'nobox', type: 'text', text: '' },
		],
		edges: [
			{ id: 'ab', fromNode: 'a', fromSide: 'right', toNode: 'b', toSide: 'left', color: '4' },
			{ id: 'bu', fromNode: 'b', toNode: 'u' },
			{ id: 'missing', fromNode: 'a', toNode: 'zzz' },
			{ fromNode: 'a', toNode: 'b' },
		],
	})
	expect(minimap).toEqual({
		viewBox: '-50 -50 1100 200',
		strokeWidth: 10,
		groups: [{ x: 0, y: 0, width: 200, height: 100, color: '1' }],
		edges: [
			{ path: edgeGeometry(a, 'right', b, 'left', 'none', 'none').path, color: '4' },
			{ path: edgeGeometry(b, sideTowards(b, u), u, sideTowards(u, b), 'none', 'none').path },
		],
		nodes: [
			{ x: 0, y: 0, width: 50, height: 50 },
			{ x: 150, y: 50, width: 50, height: 50, color: '#ff0000' },
			{ x: 900, y: 0, width: 100, height: 100 },
		],
	})
})

it('is undefined for a canvas without boxes', () => {
	expect(canvasMinimap({ nodes: [{ id: 'x', type: 'text' }] })).toBeUndefined()
	expect(canvasMinimap({})).toBeUndefined()
})

it('draws an Obsidian canvas', () => {
	const { canvas } = parseCanvas(readFileSync(new URL('./fixtures/obsidian-demo.canvas', import.meta.url), 'utf8'))
	const minimap = canvasMinimap(canvas)!
	expect(minimap.groups).toHaveLength(1)
	expect(minimap.nodes).toHaveLength(11)
	expect(minimap.edges).toHaveLength(3)
	expect(minimap.viewBox.split(' ').map(Number).every(Number.isFinite)).toBe(true)
})
