export type Point = { x: number; y: number }
export type Rect = { x: number; y: number; width: number; height: number }

export type CanvasColor = string

export type NodeType = 'text' | 'file' | 'link' | 'group'
export type Side = 'top' | 'right' | 'bottom' | 'left'
export type EndShape = 'none' | 'arrow'

export interface JSONCanvasNodeBase {
	id: string
	type: NodeType
	x: number
	y: number
	width: number
	height: number
	color?: CanvasColor
}

export interface JSONCanvasTextNode extends JSONCanvasNodeBase {
	type: 'text'
	text: string
}

export interface JSONCanvasFileNode extends JSONCanvasNodeBase {
	type: 'file'
	file: string
	subpath?: string
}

export interface JSONCanvasLinkNode extends JSONCanvasNodeBase {
	type: 'link'
	url: string
}

export interface JSONCanvasGroupNode extends JSONCanvasNodeBase {
	type: 'group'
	label?: string
	background?: string
	backgroundStyle?: 'cover' | 'ratio' | 'repeat'
}

export type JSONCanvasNode =
	| JSONCanvasTextNode
	| JSONCanvasFileNode
	| JSONCanvasLinkNode
	| JSONCanvasGroupNode

export interface JSONCanvasEdge {
	id: string
	fromNode: string
	toNode: string
	fromSide?: Side
	toSide?: Side
	fromEnd?: EndShape
	toEnd?: EndShape
	label?: string
	styleAttributes?: Record<string, string>
	color?: CanvasColor
}

export interface JSONCanvasMetadata {
	version: string
	frontmatter?: Record<string, string>
}

export interface JSONCanvas {
	nodes?: JSONCanvasNode[]
	edges?: JSONCanvasEdge[]
	metadata?: JSONCanvasMetadata
}

export function createEmptyCanvas(): JSONCanvas {
	return {
		nodes: [],
		edges: [],
		metadata: { version: '1.0', frontmatter: {} },
	}
}

export function generateId(prefix = ''): string {
	const base = Math.random().toString(16).slice(2) + Date.now().toString(16)
	return prefix ? `${prefix}-${base}` : base
}

export function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value))
}

export function deepCloneCanvas(canvas: JSONCanvas): JSONCanvas {
	return JSON.parse(JSON.stringify(canvas)) as JSONCanvas
}


