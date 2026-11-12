import { computed, ref, shallowRef, toRaw, watch, type ComputedRef, type Ref, type ShallowRef } from 'vue'
import {
	CanvasHistory, canvasIssues, containsBBox, edgeGeometry, fileLabel, growBBox, intersectsBBox, isSupportedEdge, isSupportedNode, nodeBox,
	normalizeCanvas, pointBox, unionBBox, viewportBBox, ZOOM_BREAKPOINT,
	type BBox, type CanvasIssue, type EdgeGeometry, type JSONCanvas, type JSONCanvasEdge, type JSONCanvasNode, type JSONCanvasUnsupportedNode, type Point, type Viewport,
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
	/** Unique among nodes and edges (an id shared with another gets the index appended). */
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
	edgeByKey: Map<string, SceneEdge>
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
	/** Keys of the selected nodes and edges. */
	selected: ShallowRef<ReadonlySet<string>>
	select: (keys: Iterable<string>) => void
	/** Shows `canvas` without recording it (a drag in progress). */
	preview: (canvas: JSONCanvas) => void
	/** Makes `canvas` (default: the preview) the document: reported to the parent and recorded for undo. */
	commit: (canvas?: JSONCanvas) => void
	/**
	 * Changes the committed document without an undo step of its own (a card fitting the media it loaded). Skipped
	 * while a drag previews another.
	 */
	amend: (change: (canvas: JSONCanvas) => JSONCanvas) => void
	/** Width / height that nodes keep when resized, by key: images, video and ratio backgrounds, once loaded. */
	aspects: Map<string, number>
	undo: () => void
	redo: () => void
	canUndo: Ref<boolean>
	canRedo: Ref<boolean>
	viewport: ViewportController
	visibleNodes: ComputedRef<SceneNode[]>
	/** Edges to draw; during a move, those with one moved end at their new shape. */
	visibleEdges: ComputedRef<SceneEdge[]>
	/**
	 * A move in progress: these nodes (and the edges between them) are drawn `moveDelta` away from where the
	 * document has them, until the move is committed. Cheaper than a new document per frame.
	 */
	moving: ShallowRef<MovingSet | undefined>
	moveDelta: ShallowRef<Point>
	/** At or below the zoom where labels hide. */
	zoomedOut: ComputedRef<boolean>
	/** At or below the zoom where card content gives way to placeholders. */
	contentHidden: ComputedRef<boolean>
	zoomToFit: (jump?: boolean) => void
	zoomToSelection: () => void
}

/** What a move carries: node keys, and the keys of edges with both ends among them. */
export interface MovingSet {
	nodes: ReadonlySet<string>
	edges: ReadonlySet<string>
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
	const aspects = new Map<string, number>()

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
		// The editor's own documents are normalized already: no copy needed to find their issues.
		issues.value = canvasIssues(doc)
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

	function amend(change: (doc: JSONCanvas) => JSONCanvas) {
		if (canvas.value !== committed) return
		const doc = change(committed)
		if (doc === committed) return
		apply(doc)
		// A pending push records the amended document anyway.
		if (pendingPush === undefined) history.replace(doc)
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
	const moving = shallowRef<MovingSet>()
	const moveDelta = shallowRef<Point>({ x: 0, y: 0 })
	const shift = (b: BBox, d: Point): BBox => ({ minX: b.minX + d.x, minY: b.minY + d.y, maxX: b.maxX + d.x, maxY: b.maxY + d.y })
	/** During a move, the edges with one moved end (the others move whole, by CSS). */
	const halfMoved = computed(() => {
		const m = moving.value
		if (!m) return []
		const boxes = new Set([...m.nodes].map(k => scene.value.byKey.get(k)?.box))
		return scene.value.edges.filter(e => !m.edges.has(e.key) && (boxes.has(e.from) || boxes.has(e.to)))
			.map(e => ({ e, fromMoved: boxes.has(e.from) }))
	})
	/** Those edges at their shape for the current offset. */
	const reshaped = computed(() => {
		const d = moveDelta.value, out = new Map<string, SceneEdge>()
		for (const { e, fromMoved } of halfMoved.value) {
			out.set(e.key, sceneEdge(e.key, e.edge, fromMoved ? shift(e.from, d) : e.from, fromMoved ? e.to : shift(e.to, d), e.color))
		}
		return out
	})
	const visibleNodes = stableFilter(() => scene.value.nodes, n =>
		intersectsBBox(moving.value?.nodes.has(n.key) ? shift(n.box, moveDelta.value) : n.box, visibleBox.value))
	const visibleEdges = stableFilter(
		() => {
			const r = reshaped.value
			return r.size ? scene.value.edges.map(e => r.get(e.key) ?? e) : scene.value.edges
		},
		e => intersectsBBox(moving.value?.edges.has(e.key) ? shift(e.bounds, moveDelta.value) : e.bounds, visibleBox.value),
	)

	function zoomToFit(jump = false) {
		const box = unionBBox(scene.value.nodes.map(n => n.box))
		if (box) viewport.zoomToBBox(box, jump)
	}

	function zoomToSelection() {
		const { byKey, edgeByKey } = scene.value
		const box = unionBBox([...selected.value].flatMap((k) => {
			const e = edgeByKey.get(k)
			return byKey.get(k)?.box ?? (e ? [unionBBox([pointBox(e.shape.start), pointBox(e.shape.end)])!] : [])
		}))
		if (box) viewport.zoomToBBox(box)
	}

	return {
		canvas, issues, scene, selected, canUndo, canRedo, viewport, visibleNodes, visibleEdges, moving, moveDelta,
		zoomedOut: computed(() => view.zoom <= ZOOM_BREAKPOINT),
		contentHidden: computed(() => view.zoom <= ZOOM_BREAKPOINT - o.zoomBreakpointOffset()),
		select: (keys) => {
			selected.value = new Set(keys)
		},
		preview: (doc) => {
			canvas.value = doc
		},
		commit, amend, aspects, undo, redo, zoomToFit, zoomToSelection,
	}
}

function buildScene(canvas: JSONCanvas, nodeCache: WeakMap<object, SceneNode>, edgeCache: WeakMap<object, SceneEdge>): Scene {
	const nodes: SceneNode[] = []
	const byKey = new Map<string, SceneNode>()
	const boxes = new Map<string, BBox>()
	for (const [index, node] of (canvas.nodes ?? []).entries()) {
		// Not a node at all (`null`, a number): kept in the document, nothing to draw.
		if (typeof node !== 'object' || node === null) continue
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
	const edgeByKey = new Map<string, SceneEdge>()
	for (const [index, edge] of (canvas.edges ?? []).entries()) {
		if (!isSupportedEdge(edge) || !edge.fromSide || !edge.toSide) continue
		const from = boxes.get(edge.fromNode), to = boxes.get(edge.toNode)
		if (!from || !to) continue
		const key = byKey.has(edge.id) || edgeByKey.has(edge.id) ? `${edge.id}#${index}` : edge.id
		let item = edgeCache.get(edge)
		if (item?.key !== key || item.from !== from || item.to !== to) {
			item = sceneEdge(key, edge, from, to, colorBinding(edge.color))
			edgeCache.set(edge, item)
		}
		edges.push(item)
		edgeByKey.set(key, item)
	}
	return { nodes, edges, byKey, edgeByKey }
}

/** An edge drawn between `from` and `to`. */
function sceneEdge(key: string, edge: JSONCanvasEdge, from: BBox, to: BBox, color: ColorBinding): SceneEdge {
	const shape = edgeGeometry(from, edge.fromSide!, to, edge.toSide!, edge.fromEnd, edge.toEnd)
	const anchors = unionBBox([pointBox(shape.start), pointBox(shape.end)])!
	return { key, edge, from, to, shape, color, bounds: growBBox(anchors, EDGE_MARGIN) }
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
