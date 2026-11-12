import { computed, shallowRef, watch, type Ref } from 'vue'
import {
	containsBBox, edgeGeometry, fileLabel, growBBox, intersectsBBox, isSupportedEdge, isSupportedNode, nodeBox, normalizeCanvas,
	unionBBox, viewportBBox, ZOOM_BREAKPOINT,
	type BBox, type CanvasIssue, type EdgeGeometry, type JSONCanvas, type JSONCanvasEdge, type JSONCanvasNode, type JSONCanvasUnsupportedNode, type Viewport,
} from '../../core'
import { colorBinding, type ColorBinding } from '../utils/color'
import { useViewport, type WheelBehavior } from './useViewport'

/** Whether file and link cards show their name above them. */
export type CardLabels = 'always' | 'hover' | 'never'

/** A node as drawn: the data plus what rendering needs, computed once per document. */
export interface SceneNode {
	/** Unique among nodes (an id shared by several gets the index appended). */
	key: string
	node: JSONCanvasNode | JSONCanvasUnsupportedNode
	/** `type` for a supported node, `unsupported` for any other. */
	kind: JSONCanvasNode['type'] | 'unsupported'
	box: BBox
	color: ColorBinding
	/** The name above the card (file and link nodes). */
	label?: string
}

export interface SceneEdge {
	key: string
	edge: JSONCanvasEdge
	shape: EdgeGeometry
	color: ColorBinding
	/** The anchors' box grown by how far a curve can bulge past them. */
	bounds: BBox
}

export interface CanvasEditorOptions {
	canvas: () => JSONCanvas
	wheelBehavior: () => WheelBehavior
	/** Lowers the zoom at which card content gives way to placeholders. */
	zoomBreakpointOffset: () => number
	/** The viewport to start at; without one the view fits the canvas. */
	initialViewport: () => Viewport | undefined
	onViewportSettled: (v: Viewport) => void
}

/** How far (world units) a curve can bulge past its anchors: stub + control distance × 0.75 + slack. */
const EDGE_MARGIN = 7 + 0.75 * 150 + 48

/** The canvas shown in `el`: its normalized document, what to draw, and the view. */
export function useCanvasEditor(el: Readonly<Ref<HTMLElement | null>>, o: CanvasEditorOptions) {
	const canvas = shallowRef<JSONCanvas>({ nodes: [], edges: [] })
	const issues = shallowRef<CanvasIssue[]>([])
	watch(o.canvas, (value) => {
		const parsed = normalizeCanvas(value)
		canvas.value = parsed.canvas
		issues.value = parsed.issues
	}, { immediate: true })

	const scene = computed(() => buildScene(canvas.value))

	const viewport = useViewport(el, {
		wheelBehavior: o.wheelBehavior,
		onSettled: o.onViewportSettled,
		onReady: () => {
			const start = o.initialViewport()
			if (start) viewport.setViewport(start)
			else zoomToFit(true)
		},
	})
	const { view, size } = viewport

	// What's mounted: the view plus half its size on each side, kept until the view leaves it or is zoomed in past
	// half of it, so a pan only changes what's mounted every so often instead of on every frame.
	let mountedBox: BBox | undefined
	const visibleBox = computed(() => {
		const v = viewportBBox(view, size.width, size.height)
		const w = v.maxX - v.minX, h = v.maxY - v.minY
		if (mountedBox && containsBBox(mountedBox, v) && mountedBox.maxX - mountedBox.minX <= 4 * w) return mountedBox
		return (mountedBox = { minX: v.minX - w / 2, minY: v.minY - h / 2, maxX: v.maxX + w / 2, maxY: v.maxY + h / 2 })
	})
	const visibleNodes = stableFilter(() => scene.value.nodes, n => intersectsBBox(n.box, visibleBox.value))
	const visibleEdges = stableFilter(() => scene.value.edges, e => intersectsBBox(e.bounds, visibleBox.value))
	const zoomedOut = computed(() => view.zoom <= ZOOM_BREAKPOINT)
	const contentHidden = computed(() => view.zoom <= ZOOM_BREAKPOINT - o.zoomBreakpointOffset())

	/** Shows every node; `jump` skips the animation. */
	function zoomToFit(jump = false) {
		const box = unionBBox(scene.value.nodes.map(n => n.box))
		if (box) viewport.zoomToBBox(box, jump)
	}

	return { canvas, issues, scene, viewport, visibleNodes, visibleEdges, zoomedOut, contentHidden, zoomToFit }
}

function buildScene(canvas: JSONCanvas) {
	const nodes: SceneNode[] = []
	const boxes = new Map<string, BBox>()
	const keys = new Set<string>()
	for (const [index, node] of (canvas.nodes ?? []).entries()) {
		const box = nodeBox(node)
		if (!box) continue
		const id = typeof node.id === 'string' ? node.id : ''
		const key = id && !keys.has(id) ? id : `${id}#${index}`
		keys.add(key)
		if (id && !boxes.has(id)) boxes.set(id, box)
		const supported = isSupportedNode(node)
		nodes.push({
			key, node, box,
			kind: supported ? node.type : 'unsupported',
			color: colorBinding(node.color),
			label: supported && node.type === 'file' ? fileLabel(node.file, node.subpath) : supported && node.type === 'link' ? node.url : undefined,
		})
	}

	const edges: SceneEdge[] = []
	const edgeKeys = new Set<string>()
	for (const [index, edge] of (canvas.edges ?? []).entries()) {
		if (!isSupportedEdge(edge) || !edge.fromSide || !edge.toSide) continue
		const from = boxes.get(edge.fromNode), to = boxes.get(edge.toNode)
		if (!from || !to) continue
		const shape = edgeGeometry(from, edge.fromSide, to, edge.toSide, edge.fromEnd, edge.toEnd)
		const { start: a, end: b } = shape
		const anchors = { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) }
		const key = edgeKeys.has(edge.id) ? `${edge.id}#${index}` : edge.id
		edgeKeys.add(key)
		edges.push({ key, edge, shape, color: colorBinding(edge.color), bounds: growBBox(anchors, EDGE_MARGIN) })
	}
	return { nodes, edges }
}

/**
 * `source()` filtered by `keep`, as a computed that returns the previous array while the same items pass, so what
 * renders it isn't re-rendered for every frame of a pan.
 */
function stableFilter<T>(source: () => T[], keep: (item: T) => boolean) {
	let previous: T[] = []
	return computed(() => {
		const next = source().filter(keep)
		if (next.length === previous.length && next.every((item, i) => item === previous[i])) return previous
		return (previous = next)
	})
}
