import { describe, expect, it } from 'vitest'
import {
	edgeGeometry, fitViewport, MAX_DEPTH, nodeBox, parseCanvas, stringifyCanvas, unionBBox, type JSONCanvas,
} from '../src/runtime/core'

/** The same pseudo-random numbers for a seed (`FUZZ_SEED` picks another run's). */
function random(seed: number) {
	let s = seed % 2147483647 || 1
	const next = () => (s = (s * 48271) % 2147483647) / 2147483647
	return {
		int: (n: number) => Math.floor(next() * n),
		pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!,
		chance: (p: number) => next() < p,
	}
}

type Random = ReturnType<typeof random>

/** Anything JSON can hold, a few levels deep. */
function anyValue(r: Random, depth = 0): unknown {
	const kind = r.int(depth > 3 ? 6 : 8)
	switch (kind) {
		case 0: return null
		case 1: return r.chance(0.5)
		case 2: return r.pick([0, -1, 1.5, -0.4, 1e308, -1e308, 1e7, 1e7 + 1, 2 ** 53, Number.MIN_VALUE])
		case 3: return r.pick(['', 'text', '1', '#ff0000', '255,0,0', 'right', 'arrow', '__proto__', 'ﷺ\u202Eltr', '\u0000', '<script>alert(1)</script>', 'javascript:alert(1)'])
		case 4: return r.pick(['text', 'file', 'link', 'group', 'shape'])
		case 5: return r.int(5000) - 2500
		case 6: return Array.from({ length: r.int(4) }, () => anyValue(r, depth + 1))
		default: return Object.fromEntries(Array.from({ length: r.int(4) }, () => [r.pick(['a', 'x', 'width', 'type', 'nested', '__proto__', 'constructor']), anyValue(r, depth + 1)]))
	}
}

const FIELDS = ['id', 'type', 'x', 'y', 'width', 'height', 'text', 'file', 'subpath', 'url', 'label', 'color', 'background', 'backgroundStyle']
const EDGE_FIELDS = ['id', 'fromNode', 'toNode', 'fromSide', 'toSide', 'fromEnd', 'toEnd', 'color', 'label']

/** A canvas-shaped document where any field may be missing, wrong or hostile; some nodes and edges are fine. */
function anyCanvas(r: Random): JSONCanvas {
	const ids = Array.from({ length: 1 + r.int(6) }, (_, i) => r.chance(0.1) ? 'dup' : `n${i}`)
	const nodes = ids.map((id) => {
		if (r.chance(0.1)) return anyValue(r)
		const node: Record<string, unknown> = r.chance(0.5)
			? { id, type: 'text', text: 'ok', x: r.int(1000), y: r.int(1000), width: 1 + r.int(400), height: 1 + r.int(400) }
			: {}
		for (const f of FIELDS) if (r.chance(0.3)) node[f] = f === 'id' ? r.pick([...ids, 7]) : anyValue(r)
		if (r.chance(0.3)) node[`extra${r.int(3)}`] = anyValue(r)
		return node
	})
	const edges = Array.from({ length: r.int(6) }, (_, i) => {
		if (r.chance(0.1)) return anyValue(r)
		const edge: Record<string, unknown> = { id: `e${i}`, fromNode: r.pick(ids), toNode: r.pick([...ids, 'gone']) }
		for (const f of EDGE_FIELDS) if (r.chance(0.25)) edge[f] = anyValue(r)
		return edge
	})
	const doc: Record<string, unknown> = { nodes, edges }
	if (r.chance(0.2)) doc.extra = anyValue(r)
	return doc as JSONCanvas
}

/** Every number in `value` (walked iteratively). */
function numbers(value: unknown): number[] {
	const out: number[] = [], stack = [value]
	while (stack.length) {
		const v = stack.pop()
		if (typeof v === 'number') out.push(v)
		else if (v && typeof v === 'object') stack.push(...Object.values(v))
	}
	return out
}

const SEED = Number(process.env.FUZZ_SEED) || 1
const RUNS = Number(process.env.FUZZ_RUNS) || 400

describe('hostile documents', () => {
	it(`parse, normalize, stringify and geometry hold for ${RUNS} random documents (seed ${SEED})`, () => {
		for (let run = 0; run < RUNS; run++) {
			const r = random(SEED + run)
			const text = JSON.stringify(anyCanvas(r))
			const context = `seed ${SEED + run}: ${text.slice(0, 300)}`
			// Only the documented refusals.
			let parsed: ReturnType<typeof parseCanvas>
			try {
				parsed = parseCanvas(text)
			}
			catch (e) {
				expect(e, context).toBeInstanceOf(TypeError)
				continue
			}
			const written = stringifyCanvas(parsed.canvas)
			// What's written reads back the same: unknown data kept, normalizing settled.
			expect(parseCanvas(written).canvas, context).toEqual(parsed.canvas)
			expect(JSON.parse(written), context).toEqual(JSON.parse(JSON.stringify(parsed.canvas)))
			// Nothing drawn is NaN or infinite.
			const boxes = (parsed.canvas.nodes ?? []).flatMap(n => nodeBox(n) ?? [])
			const union = unionBBox(boxes)
			if (union) expect(numbers(fitViewport(union, 1000, 800)).every(Number.isFinite), context).toBe(true)
			for (const a of boxes) {
				for (const b of boxes) expect(numbers(edgeGeometry(a, 'right', b, 'top')).every(Number.isFinite), context).toBe(true)
			}
		}
	})

	it('refuses nesting deeper than MAX_DEPTH instead of overflowing the stack later', () => {
		const deep = (n: number) => `{"nodes":[],"edges":[],"x":${'['.repeat(n)}${']'.repeat(n)}}`
		expect(() => parseCanvas(deep(MAX_DEPTH - 3))).not.toThrow()
		expect(() => parseCanvas(deep(50_000))).toThrow(TypeError)
	})

	it('keeps nodes with impossible boxes, without drawing them', () => {
		const { canvas, issues } = parseCanvas(JSON.stringify({ nodes: [
			{ id: 'huge', type: 'text', text: '', x: 1e308, y: 0, width: 10, height: 10 },
			{ id: 'negative', type: 'text', text: '', x: 0, y: 0, width: -100, height: 50 },
			{ id: 'zero', type: 'text', text: '', x: 0, y: 0, width: 0, height: 0 },
		], edges: [{ id: 'e', fromNode: 'huge', toNode: 'zero' }] }))
		expect(canvas.nodes!.map(n => [n.id, nodeBox(n)])).toEqual([['huge', undefined], ['negative', undefined], ['zero', undefined]])
		// The edge is kept too; with no box at either end it isn't drawn.
		expect(issues.map(i => i.kind)).toEqual(['unsupported-node', 'unsupported-node', 'unsupported-node'])
		expect(stringifyCanvas(canvas)).toContain('"x":1e+308')
	})
})
