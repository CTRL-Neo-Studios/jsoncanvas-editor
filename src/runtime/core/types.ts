/**
 * JSON Canvas 1.0 (https://jsoncanvas.org/spec/1.0/). Every object keeps keys the spec doesn't define (index
 * signatures), so other apps' data round-trips.
 */

export type CanvasSide = 'top' | 'right' | 'bottom' | 'left'
export type CanvasEnd = 'none' | 'arrow'
/** A preset `"1"`–`"6"` (red, orange, yellow, green, cyan, purple) or a hex color such as `"#ff0000"`. */
export type CanvasColor = string

interface NodeBase {
	id: string
	x: number
	y: number
	width: number
	height: number
	color?: CanvasColor
	[key: string]: unknown
}

export interface JSONCanvasTextNode extends NodeBase {
	type: 'text'
	/** Markdown. */
	text: string
}

export interface JSONCanvasFileNode extends NodeBase {
	type: 'file'
	file: string
	/** A heading or block in the file; starts with `#`. */
	subpath?: string
}

export interface JSONCanvasLinkNode extends NodeBase {
	type: 'link'
	url: string
}

export interface JSONCanvasGroupNode extends NodeBase {
	type: 'group'
	label?: string
	/** Path to a background image. */
	background?: string
	/** `cover` when absent. */
	backgroundStyle?: 'cover' | 'ratio' | 'repeat'
}

/** A node the editor understands; `isSupportedNode` tells it apart from a `JSONCanvasUnsupportedNode`. */
export type JSONCanvasNode = JSONCanvasTextNode | JSONCanvasFileNode | JSONCanvasLinkNode | JSONCanvasGroupNode
export type CanvasNodeType = JSONCanvasNode['type']

/** A node of an unknown `type`, or with required fields missing or of the wrong type. Kept as it is. */
export interface JSONCanvasUnsupportedNode {
	[key: string]: unknown
}

export interface JSONCanvasEdge {
	id: string
	fromNode: string
	fromSide?: CanvasSide
	/** `none` when absent. */
	fromEnd?: CanvasEnd
	toNode: string
	toSide?: CanvasSide
	/** `arrow` when absent. */
	toEnd?: CanvasEnd
	color?: CanvasColor
	label?: string
	[key: string]: unknown
}

/** An edge without a string `id`, `fromNode` or `toNode`. Kept as it is. */
export interface JSONCanvasUnsupportedEdge {
	[key: string]: unknown
}

export interface JSONCanvas {
	/** In z-order: the first is drawn lowest. */
	nodes?: Array<JSONCanvasNode | JSONCanvasUnsupportedNode>
	edges?: Array<JSONCanvasEdge | JSONCanvasUnsupportedEdge>
	[key: string]: unknown
}

/** Something in a canvas the editor keeps but can't show as the spec intends. */
export type CanvasIssue =
	/** `reason`: `type` isn't one of the spec's, or a required field is missing or of the wrong type. */
	| { kind: 'unsupported-node', index: number, id?: string, type?: string, reason: 'unknown-type' | 'invalid' }
	| { kind: 'unsupported-edge', index: number, id?: string }
	/** An edge whose `fromNode` or `toNode` names no node; it isn't drawn. */
	| { kind: 'missing-node', edgeId: string, nodeId: string }
	/** Two nodes, or two edges, share an id. */
	| { kind: 'duplicate-id', of: 'node' | 'edge', id: string }

const HEX = '0123456789abcdef'

/** A new id like Obsidian's: 16 random lowercase hex characters. */
export function newId(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(16))
	let id = ''
	for (const b of bytes) id += HEX[b & 15]
	return id
}
