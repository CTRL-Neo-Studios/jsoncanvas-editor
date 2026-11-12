import { computed, ref, shallowRef, toRaw, watch, type ComputedRef, type Ref, type ShallowRef } from 'vue'
import {
	CanvasHistory, containsBBox, edgeGeometry, fileLabel, growBBox, intersectsBBox, isSupportedEdge, isSupportedNode, nodeBox,
	normalizeCanvas, unionBBox, viewportBBox, ZOOM_BREAKPOINT,
	type BBox, type CanvasIssue, type EdgeGeometry, type JSONCanvas, type JSONCanvasEdge, type JSONCanvasNode, type JSONCanvasUnsupportedNode, type Viewport,
} from '../../core'
import { colorBinding, type ColorBinding } from '../utils/color'
import { useViewport, type ViewportController, type WheelBehavior } from './useViewport'

/** Whether file and link cards show their name above them. */
export type CardLabels = 'always' | 'hover' | 'never'

/** A node as drawn: the data plus what rendering needs. Reused while its node object is unchanged. */
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
	/** The boxes it was drawn between: reused while the edge and both boxes are unchanged. */
	from: BBox
	to: BBox
	shape: EdgeGeometry
	color: ColorBinding
	/** The anchors' box grown by how far a curve can bulge past them. */
	bounds: BBox
}

export interface Scene {
	nodes: SceneNode[]
	edges: SceneEdge[]
	byKey: Map<string, SceneNode>
}

export interface CanvasEditorOptions {
	canvas: () => JSONCanvas
	/** The document changed by an edit. */
	onChange: (canvas: JSONCanvas) => void
	wheelBehavior: () => WheelBehavior
	/** Lowers the zoom at which card content gives way to placeholders. */
	zoomBreakpointOffset: () => number
	/** The viewport to start at; without one the view fits the canvas. */
	initialViewport: () => Viewport | undefined
	onViewportSettled: (v: Viewport) => void
}

/** The document being edited, what's drawn of it, the selection, undo, and the view. */
export interface CanvasEditor {
	/** The document as shown: the last committed one, or a drag's preview of the next. */
	canvas: ShallowRef<JSONCanvas>
	issues: ShallowRef<CanvasIssue[]>
	scene: ComputedRef<Scene>
	/** Keys of the selected nodes. */
	selected: ShallowRef<ReadonlySet<string>>
	select: (keys: Iterable<string>) => void
	/** Shows `canvas` without recording it (a drag in progress). */
	preview: (canvas: JSONCanvas) => void
	/** Makes `canvas` (default: the preview) the document: reported to the parent and recorded for undo. */
	commit: (canvas?: JSONCanvas) => void
	undo: () => void
	redo: () => void
	canUndo: Ref<boolean>
	canRedo: Ref<boolean>
	viewport: ViewportController
	visibleNodes: ComputedRef<SceneNode[]>
	visibleEdges: ComputedRef<SceneEdge[]>
	/** At or below the zoom where labels hide. */
	zoomedOut: ComputedRef<boolean>
	/** At or below the zoom where card content gives way to placeholders. */
	contentHidden: ComputedRef<boolean>
	zoomToFit: (jump?: boolean) => void
	zoomToSelection: () => void
}

/** How far (world units) a curve can bulge past its anchors: stub + control distance × 0.75 + slack. */
const EDGE_MARGIN = 7 + 0.75 * 150 + 48
/** Edits closer together than this are one undo step. */
const HISTORY_DELAY = 250

export function useCanvasEditor(el: Readonly<Ref<HTMLElement | null>>, o: CanvasEditorOptions): CanvasEditor {
	const canvas = shallowRef<JSONCanvas>({ nodes: [], edges: [] })
	const issues = shallowRef<CanvasIssue[]>([])
	const selected = shallowRef<ReadonlySet<string>>(new Set())
	const history = new CanvasHistory<JSONCanvas>()
	const canUndo = ref(false), canRedo = ref(false)
	/** The last committed document; what undo records. Documents are never changed in place. */
	let committed = canvas.value
	let pendingPush: ReturnType<typeof setTimeout> | undefined

	watch(o.canvas, (value) => {
		const raw = toRaw(value) // a parent's `ref()` hands over a proxy, which `structuredClone` can't copy
		if (raw === committed) return // our own edit, handed back
		const parsed = normalizeCanvas(raw)
		committed = canvas.value = parsed.canvas
		issues.value = parsed.issues
		selected.value = new Set()
		clearTimeout(pendingPush)
		pendingPush = undefined
		history.clear()
		history.push(committed)
		syncHistory()
	}, { immediate: true })

	function syncHistory() {
		canUndo.value = history.canUndo || pendingPush !== undefined
		canRedo.value = history.canRedo && pendingPush === undefined
	}

	function flushHistory() {
		if (pendingPush === undefined) return
		clearTimeout(pendingPush)
		pendingPush = undefined
		history.push(committed)
		syncHistory()
	}

	function apply(doc: JSONCanvas) {
		committed = canvas.value = doc
		issues.value = normalizeCanvas(doc).issues
		o.onChange(doc)
	}

	function commit(doc = canvas.value) {
		if (doc === committed) return
		apply(doc)
		clearTimeout(pendingPush)
		pendingPush = setTimeout(flushHistory, HISTORY_DELAY)
		syncHistory()
	}

	function undo() {
		flushHistory()
		const doc = history.undo()
		if (doc) apply(doc)
		syncHistory()
	}

	function redo() {
		const doc = history.redo()
		if (doc) apply(doc)
		syncHistory()
	}

	const nodeCache = new WeakMap<object, SceneNode>()
	const edgeCache = new WeakMap<object, SceneEdge>()
	const scene = computed(() => buildScene(canvas.value, nodeCache, edgeCache))

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

	function zoomToFit(jump = false) {
		const box = unionBBox(scene.value.nodes.map(n => n.box))
		if (box) viewport.zoomToBBox(box, jump)
	}

	function zoomToSelection() {
		const box = unionBBox([...selected.value].flatMap(k => scene.value.byKey.get(k)?.box ?? []))
		if (box) viewport.zoomToBBox(box)
	}

	return {
		canvas, issues, scene, selected, canUndo, canRedo, viewport, visibleNodes, visibleEdges,
		zoomedOut: computed(() => view.zoom <= ZOOM_BREAKPOINT),
		contentHidden: computed(() => view.zoom <= ZOOM_BREAKPOINT - o.zoomBreakpointOffset()),
		select: (keys) => {
			selected.value = new Set(keys)
		},
		preview: (doc) => {
			canvas.value = doc
		},
		commit, undo, redo, zoomToFit, zoomToSelection,
	}
}

function buildScene(canvas: JSONCanvas, nodeCache: WeakMap<object, SceneNode>, edgeCache: WeakMap<object, SceneEdge>): Scene {
	const nodes: SceneNode[] = []
	const byKey = new Map<string, SceneNode>()
	const boxes = new Map<string, BBox>()
	for (const [index, node] of (canvas.nodes ?? []).entries()) {
		const id = typeof node.id === 'string' ? node.id : ''
		const key = id && !byKey.has(id) ? id : `${id}#${index}`
		let item = nodeCache.get(node)
		if (item?.key !== key) {
			const box = nodeBox(node)
			if (!box) continue
			const supported = isSupportedNode(node)
			item = {
				key, node, box,
				kind: supported ? node.type : 'unsupported',
				color: colorBinding(node.color),
				label: supported && node.type === 'file' ? fileLabel(node.file, node.subpath) : supported && node.type === 'link' ? node.url : undefined,
			}
			nodeCache.set(node, item)
		}
		nodes.push(item)
		byKey.set(key, item)
		if (id && !boxes.has(id)) boxes.set(id, item.box)
	}

	const edges: SceneEdge[] = []
	const edgeKeys = new Set<string>()
	for (const [index, edge] of (canvas.edges ?? []).entries()) {
		if (!isSupportedEdge(edge) || !edge.fromSide || !edge.toSide) continue
		const from = boxes.get(edge.fromNode), to = boxes.get(edge.toNode)
		if (!from || !to) continue
		const key = edgeKeys.has(edge.id) ? `${edge.id}#${index}` : edge.id
		edgeKeys.add(key)
		let item = edgeCache.get(edge)
		if (item?.key !== key || item.from !== from || item.to !== to) {
			const shape = edgeGeometry(from, edge.fromSide, to, edge.toSide, edge.fromEnd, edge.toEnd)
			const { start: a, end: b } = shape
			const anchors = { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) }
			item = { key, edge, from, to, shape, color: colorBinding(edge.color), bounds: growBBox(anchors, EDGE_MARGIN) }
			edgeCache.set(edge, item)
		}
		edges.push(item)
	}
	return { nodes, edges, byKey }
}

/**
 * `source()` filtered by `keep`, as a computed that returns the previous array while the same items pass, so what
 * renders it isn't re-rendered for every frame of a pan.
 */
function stableFilter<T>(source: () => T[], keep: (item: T) => boolean): ComputedRef<T[]> {
	let previous: T[] = []
	return computed(() => {
		const next = source().filter(keep)
		if (next.length === previous.length && next.every((item, i) => item === previous[i])) return previous
		return (previous = next)
	})
}
