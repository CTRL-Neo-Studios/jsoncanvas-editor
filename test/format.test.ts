import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isSupportedNode, normalizeCanvas, orderNodes, parseCanvas, stringifyCanvas, type JSONCanvas } from '../src/runtime/core'

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')

describe('parseCanvas + stringifyCanvas', () => {
	it.each(['spec-sample.canvas', 'obsidian-demo.canvas', 'obsidian-untitled.canvas'])('round-trips %s byte for byte', (name) => {
		const text = fixture(name)
		const { canvas, issues } = parseCanvas(text)
		expect(issues).toEqual([])
		expect(stringifyCanvas(canvas)).toBe(text)
	})

	it('writes nested values over several lines, keeps unknown keys and omits undefined', () => {
		const canvas: JSONCanvas = {
			nodes: [{ id: 'a', type: 'text', text: 'hi', x: 0, y: 0, width: 1, height: 1, extra: { deep: [1, 2] }, gone: undefined }],
			edges: [],
			app: 'other',
		}
		const text = stringifyCanvas(canvas)
		expect(text).toBe([
			'{',
			'\t"nodes":[',
			'\t\t{',
			'\t\t\t"id":"a",',
			'\t\t\t"type":"text",',
			'\t\t\t"text":"hi",',
			'\t\t\t"x":0,',
			'\t\t\t"y":0,',
			'\t\t\t"width":1,',
			'\t\t\t"height":1,',
			'\t\t\t"extra":{',
			'\t\t\t\t"deep":[1,2]',
			'\t\t\t}',
			'\t\t}',
			'\t],',
			'\t"edges":[],',
			'\t"app":"other"',
			'}',
		].join('\n'))
		expect(stringifyCanvas(parseCanvas(text).canvas)).toBe(text)
	})

	it('reads empty text as an empty canvas', () => {
		expect(parseCanvas(' \n')).toEqual({ canvas: { nodes: [], edges: [] }, issues: [] })
	})

	it('throws rather than guess at a broken file', () => {
		expect(() => parseCanvas('{"nodes":[')).toThrow(SyntaxError)
		expect(() => parseCanvas('[]')).toThrow(TypeError)
		expect(() => parseCanvas('{"nodes":{}}')).toThrow(TypeError)
	})
})

describe('unsupported data', () => {
	const text = JSON.stringify({
		nodes: [
			{ id: 'a', type: 'text', text: 'A', x: 0, y: 0, width: 100, height: 50 },
			{ id: 'shape', type: 'shape', x: 300, y: 0, width: 100, height: 50, kind: 'star' },
			{ id: 'noText', type: 'text', x: 0, y: 200, width: 100, height: 50 },
			{ id: 'badStyle', type: 'group', x: 0, y: 0, width: 10, height: 10, backgroundStyle: 'contain' },
			{ type: 'text', text: 'no id', x: 0, y: 0, width: 1, height: 1 },
			{ id: 'a', type: 'text', text: 'again', x: 999, y: 999, width: 1, height: 1 },
		],
		edges: [
			{ id: 'e1', fromNode: 'a', toNode: 'shape' },
			{ id: 'e2', fromNode: 'a', toNode: 'ghost' },
			{ id: 'e3', fromNode: 'a' },
			{ id: 'e1', fromNode: 'a', toNode: 'a', fromEnd: 'circle' },
		],
	})

	it('keeps everything and lists what it can\'t use', () => {
		const { canvas, issues } = parseCanvas(text)
		expect(canvas.nodes).toHaveLength(6)
		expect(canvas.edges).toHaveLength(4)
		expect(canvas.nodes![1]).toMatchObject({ type: 'shape', kind: 'star' })
		expect(issues).toEqual([
			{ kind: 'unsupported-node', index: 1, id: 'shape', type: 'shape', reason: 'unknown-type' },
			{ kind: 'unsupported-node', index: 2, id: 'noText', type: 'text', reason: 'invalid' },
			{ kind: 'unsupported-node', index: 3, id: 'badStyle', type: 'group', reason: 'invalid' },
			{ kind: 'unsupported-node', index: 4, id: undefined, type: 'text', reason: 'invalid' },
			{ kind: 'duplicate-id', of: 'node', id: 'a' },
			{ kind: 'missing-node', edgeId: 'e2', nodeId: 'ghost' },
			{ kind: 'unsupported-edge', index: 2, id: 'e3' },
			{ kind: 'duplicate-id', of: 'edge', id: 'e1' },
			{ kind: 'unsupported-edge', index: 3, id: 'e1' },
		])
	})

	it('connects edges to the first node with an id, and to unsupported nodes that have a box', () => {
		const { canvas } = parseCanvas(text)
		// `a` (first, at 0,0) faces `shape` (at 300,0) to its right.
		expect(canvas.edges![0]).toMatchObject({ fromSide: 'right', toSide: 'left' })
	})
})

describe('normalizeCanvas', () => {
	it('rounds boxes, turns "r,g,b" into hex and fills in missing or invalid sides', () => {
		const input: JSONCanvas = {
			nodes: [
				{ id: 'a', type: 'text', text: '', x: 0.4, y: 0.6, width: 99.5, height: 50, color: '255, 0, 10' },
				{ id: 'b', type: 'text', text: '', x: 0, y: 300, width: 100, height: 50 },
			],
			edges: [{ id: 'e', fromNode: 'a', toNode: 'b', toSide: 'middle' as never, color: '0,128,255' }],
		}
		const { canvas, issues } = normalizeCanvas(input)
		expect(issues).toEqual([])
		expect(canvas.nodes![0]).toMatchObject({ x: 0, y: 1, width: 100, height: 50, color: '#ff000a' })
		expect(canvas.edges![0]).toMatchObject({ fromSide: 'bottom', toSide: 'top', color: '#0080ff' })
		expect(input.nodes![0]!.x).toBe(0.4)
	})

	it('puts groups first, larger behind smaller, and keeps the order of everything else', () => {
		const node = (id: string, type: string, size = 10) => ({ id, type, text: '', x: 0, y: 0, width: size, height: size })
		const nodes = [node('t1', 'text'), node('small', 'group', 10), node('t2', 'text'), node('big', 'group', 100), node('x', 'shape')]
		expect(orderNodes(nodes).map(n => n.id)).toEqual(['big', 'small', 't1', 't2', 'x'])
		expect(normalizeCanvas({ nodes }).canvas.nodes!.map(n => n.id)).toEqual(['big', 'small', 't1', 't2', 'x'])
	})

	it('tells supported nodes apart', () => {
		expect(isSupportedNode({ id: 'l', type: 'link', url: 'https://x.y', x: 0, y: 0, width: 1, height: 1 })).toBe(true)
		expect(isSupportedNode({ id: 'l', type: 'link', url: 'https://x.y', x: 0, y: 0, width: '1', height: 1 })).toBe(false)
		expect(isSupportedNode({ id: 'f', type: 'file', file: 'a.md', subpath: 3, x: 0, y: 0, width: 1, height: 1 })).toBe(false)
	})
})
