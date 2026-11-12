import { normalizeColor } from './color'
import { bboxOf, sideTowards, SIDES, type BBox } from './geometry'
import type { CanvasIssue, CanvasNodeType, JSONCanvas, JSONCanvasEdge, JSONCanvasNode, JSONCanvasUnsupportedEdge, JSONCanvasUnsupportedNode } from './types'

export interface ParsedCanvas {
	canvas: JSONCanvas
	issues: CanvasIssue[]
}

type AnyNode = JSONCanvasNode | JSONCanvasUnsupportedNode
type AnyEdge = JSONCanvasEdge | JSONCanvasUnsupportedEdge

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isString = (v: unknown): v is string => typeof v === 'string'
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isOptional = (v: unknown, test: (v: unknown) => boolean) => v === undefined || test(v)
const isSide = (v: unknown) => SIDES.includes(v as never)
const isEnd = (v: unknown) => v === 'none' || v === 'arrow'
const isBackgroundStyle = (v: unknown) => v === 'cover' || v === 'ratio' || v === 'repeat'

/** Type-specific fields: required ones must be present, optional ones absent or of the right type. */
const FIELDS: Record<CanvasNodeType, (n: Record<string, unknown>) => boolean> = {
	text: n => isString(n.text),
	file: n => isString(n.file) && isOptional(n.subpath, isString),
	link: n => isString(n.url),
	group: n => isOptional(n.label, isString) && isOptional(n.background, isString) && isOptional(n.backgroundStyle, isBackgroundStyle),
}
const isNodeType = (t: unknown): t is CanvasNodeType => isString(t) && Object.hasOwn(FIELDS, t)

/** A node's box when it has numeric `x`, `y`, `width` and `height`; unsupported nodes can have one too. */
export function nodeBox(node: AnyNode): BBox | undefined {
	const { x, y, width, height } = node
	return isNumber(x) && isNumber(y) && isNumber(width) && isNumber(height) ? bboxOf({ x, y, width, height }) : undefined
}

/** Whether the editor can edit this node: a spec type with every field it needs, of the right type. */
export function isSupportedNode(node: unknown): node is JSONCanvasNode {
	return isObject(node) && isString(node.id) && isNodeType(node.type) && !!nodeBox(node)
		&& isOptional(node.color, isString) && FIELDS[node.type](node)
}

/** Whether the editor can draw this edge (given both its nodes exist). */
export function isSupportedEdge(edge: unknown): edge is JSONCanvasEdge {
	return isObject(edge) && isString(edge.id) && isString(edge.fromNode) && isString(edge.toNode)
		&& isOptional(edge.fromSide, isSide) && isOptional(edge.toSide, isSide)
		&& isOptional(edge.fromEnd, isEnd) && isOptional(edge.toEnd, isEnd)
		&& isOptional(edge.color, isString) && isOptional(edge.label, isString)
}

const area = (n: JSONCanvasNode) => n.width * n.height
const isGroup = (n: AnyNode): n is JSONCanvasNode => isSupportedNode(n) && n.type === 'group'

/**
 * Z-order the way Obsidian keeps it: groups first, larger behind smaller, so a group never covers what's in it;
 * other nodes keep their order. Stable.
 */
export function orderNodes<T extends AnyNode>(nodes: readonly T[]): T[] {
	const groups = (nodes as readonly AnyNode[]).filter(isGroup).sort((a, b) => area(b) - area(a))
	return [...groups, ...nodes.filter(n => !isGroup(n))] as T[]
}

/**
 * Reads a `.canvas` file. Empty text is an empty canvas. Throws on invalid JSON or a top level that isn't an
 * object with array `nodes`/`edges`, so a broken file is never overwritten. See `normalizeCanvas` for the rest.
 */
export function parseCanvas(text: string): ParsedCanvas {
	if (!text.trim()) return { canvas: { nodes: [], edges: [] }, issues: [] }
	return normalize(JSON.parse(text))
}

/**
 * A copy of `data` the editor can rely on, plus what it couldn't make sense of. Nothing is dropped: unknown keys,
 * unsupported nodes and edges, and edges to missing nodes all stay (and are listed in `issues`).
 * - Supported nodes: `x`, `y`, `width`, `height` rounded to integers; colors given as `"r,g,b"` become hex.
 * - Edges without (valid) `fromSide`/`toSide` get the sides facing each other, written into the data.
 * - Nodes reordered by `orderNodes`.
 */
export function normalizeCanvas(data: JSONCanvas): ParsedCanvas {
	return normalize(structuredClone(data))
}

function normalize(data: unknown): ParsedCanvas {
	if (!isObject(data)) throw new TypeError('A JSON Canvas must be a JSON object')
	for (const key of ['nodes', 'edges'] as const) {
		if (data[key] !== undefined && !Array.isArray(data[key])) throw new TypeError(`A JSON Canvas's "${key}" must be an array`)
	}
	const canvas = data as JSONCanvas
	const issues: CanvasIssue[] = []
	if (canvas.nodes) canvas.nodes = orderNodes(canvas.nodes)

	const boxes = new Map<string, BBox | undefined>()
	for (const [index, node] of (canvas.nodes ?? []).entries()) {
		if (isSupportedNode(node)) {
			node.x = Math.round(node.x)
			node.y = Math.round(node.y)
			node.width = Math.round(node.width)
			node.height = Math.round(node.height)
			if (node.color) node.color = normalizeColor(node.color)
		}
		else {
			const type = isObject(node) ? node.type : undefined
			issues.push({
				kind: 'unsupported-node', index, id: isObject(node) && isString(node.id) ? node.id : undefined,
				type: isString(type) ? type : undefined, reason: isNodeType(type) ? 'invalid' : 'unknown-type',
			})
		}
		// Edges attach to the first node with an id.
		if (isObject(node) && isString(node.id)) {
			if (boxes.has(node.id)) issues.push({ kind: 'duplicate-id', of: 'node', id: node.id })
			else boxes.set(node.id, nodeBox(node))
		}
	}

	const edgeIds = new Set<string>()
	for (const [index, edge] of (canvas.edges ?? []).entries()) normalizeEdge(edge, index, boxes, edgeIds, issues)
	return { canvas, issues }
}

function normalizeEdge(edge: AnyEdge, index: number, boxes: Map<string, BBox | undefined>, ids: Set<string>, issues: CanvasIssue[]) {
	if (!isObject(edge) || !isString(edge.id) || !isString(edge.fromNode) || !isString(edge.toNode)) {
		issues.push({ kind: 'unsupported-edge', index, id: isObject(edge) && isString(edge.id) ? edge.id : undefined })
		return
	}
	if (ids.has(edge.id)) issues.push({ kind: 'duplicate-id', of: 'edge', id: edge.id })
	ids.add(edge.id)
	if (isString(edge.color)) edge.color = normalizeColor(edge.color)
	for (const nodeId of [edge.fromNode, edge.toNode]) {
		if (!boxes.has(nodeId)) issues.push({ kind: 'missing-node', edgeId: edge.id, nodeId })
	}
	const from = boxes.get(edge.fromNode), to = boxes.get(edge.toNode)
	if (from && to) {
		if (!isSide(edge.fromSide)) edge.fromSide = sideTowards(from, to)
		if (!isSide(edge.toSide)) edge.toSide = sideTowards(to, from)
	}
	if (!isSupportedEdge(edge)) issues.push({ kind: 'unsupported-edge', index, id: edge.id })
}
