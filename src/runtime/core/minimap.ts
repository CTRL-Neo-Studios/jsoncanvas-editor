import { edgeGeometry, growBBox, rectOf, sideTowards, unionBBox, type BBox } from './geometry'
import { isSupportedEdge, isSupportedNode, nodeBox } from './parse'
import type { JSONCanvas } from './types'

export interface MinimapRect {
	x: number
	y: number
	width: number
	height: number
	color?: string
}

export interface MinimapEdge {
	/** SVG path data. */
	path: string
	color?: string
}

/** A `.canvas` file drawn small, as a static SVG: groups below edges below nodes, each in document order. */
export interface CanvasMinimap {
	/** `"minX minY width height"`: the nodes' bounds plus padding. */
	viewBox: string
	/** A line width that reads at the minimap's scale. */
	strokeWidth: number
	groups: MinimapRect[]
	edges: MinimapEdge[]
	nodes: MinimapRect[]
}

const colorOf = (o: { color?: unknown }) => (typeof o.color === 'string' && o.color ? { color: o.color } : {})

/** `canvas` as a minimap; `undefined` when no node has a box. */
export function canvasMinimap(canvas: JSONCanvas): CanvasMinimap | undefined {
	const groups: MinimapRect[] = [], nodes: MinimapRect[] = [], all: BBox[] = []
	// Edges attach to the first node with an id.
	const byId = new Map<unknown, BBox | undefined>()
	for (const node of canvas.nodes ?? []) {
		const box = nodeBox(node)
		if (typeof node === 'object' && node !== null && !byId.has(node.id)) byId.set(node.id, box)
		if (!box) continue
		all.push(box)
		;(isSupportedNode(node) && node.type === 'group' ? groups : nodes).push({ ...rectOf(box), ...colorOf(node) })
	}
	const bounds = unionBBox(all)
	if (!bounds) return undefined
	const edges: MinimapEdge[] = []
	for (const edge of canvas.edges ?? []) {
		if (!isSupportedEdge(edge)) continue
		const from = byId.get(edge.fromNode), to = byId.get(edge.toNode)
		if (!from || !to) continue
		const { path } = edgeGeometry(from, edge.fromSide ?? sideTowards(from, to), to, edge.toSide ?? sideTowards(to, from), 'none', 'none')
		edges.push({ path, ...colorOf(edge) })
	}
	const w = bounds.maxX - bounds.minX
	const { x, y, width, height } = rectOf(growBBox(bounds, Math.max(w, bounds.maxY - bounds.minY) / 20))
	return { viewBox: `${x} ${y} ${width} ${height}`, strokeWidth: Math.sqrt(w / 10), groups, edges, nodes }
}
