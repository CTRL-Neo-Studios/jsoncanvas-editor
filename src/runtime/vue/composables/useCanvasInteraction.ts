import type { DropdownMenuItem } from '@nuxt/ui'
import { computed, ref, shallowRef, type ComputedRef, type Ref, type ShallowRef } from 'vue'
import {
	boxAtSide, cloneNodes, CONNECT_DISTANCE, containsBBox, edgeGeometry, fileKind, gridSpacing, growBBox, intersectsBBox,
	lockAxis, MIN_NODE_SIZE, nearestSide, newId, NODE_SIZE, nodeBox, oppositeSide, pointBox, raiseNodes, removeFromCanvas,
	resizeBox, resizeSnapSource, scaleBoxes, snap, unionBBox,
	type BBox, type CanvasEnd, type CanvasSide, type EdgeGeometry, type JSONCanvas, type JSONCanvasEdge, type Point,
	type ResizeHandle, type SnapGuide,
} from '../../core'
import type { CanvasHost, CanvasLink } from '../host'
import { colorBinding, type ColorBinding } from '../utils/color'
import { startDrag, type DragHandlers, type DragPoint } from '../utils/drag'
import { isCloneKey, isMod, isNoSnapKey } from '../utils/platform'
import type { CanvasEditor, SceneEdge, SceneNode } from './useCanvasEditor'

export interface InteractionOptions {
	readonly: () => boolean
	snapToGrid: () => boolean
	snapToObjects: () => boolean
	host: () => CanvasHost | undefined
	/** Node types drawn by a custom card (`nodeRenderers` or a `#node-<type>` slot); they can be edited too. */
	customTypes: () => ReadonlySet<string>
}

/** An edge being drawn from a node or moved to another. */
export interface DraggedEdge {
	shape: EdgeGeometry
	color: ColorBinding
}

/** A menu open at a point in the canvas (px from its top left). */
export interface CanvasMenu {
	x: number
	y: number
	items: DropdownMenuItem[][]
	/** Runs once the menu closes, after the chosen item's `onSelect`. */
	onClose?: () => void
}

/** An edge or group label being edited; `at` (client px) is where it was clicked, for the caret. */
export interface LabelEditing {
	key: string
	at?: { x: number, y: number }
}

/** A value asked for in a dialog (a link card's URL). */
export interface CanvasPrompt {
	title: string
	value: string
	/** An error message for `value`, or `undefined` when it's acceptable. */
	validate: (value: string) => string | undefined
	submit: (value: string) => void
}

/** What the pointer and keyboard do to the canvas, and what they show while doing it. */
export interface CanvasInteraction {
	/** The node under the pointer. */
	hovered: Ref<string | undefined>
	/** The node whose resize handles show. */
	handlesFor: ComputedRef<SceneNode | undefined>
	/** The box around a multi-selection (padded), with its own handles. */
	selectionBox: ComputedRef<BBox | undefined>
	/** A drag-select rectangle in progress (world units). */
	marquee: ShallowRef<BBox | undefined>
	guides: ShallowRef<SnapGuide[]>
	/** Where copies will land while a drag clones. */
	ghosts: ShallowRef<BBox[]>
	connection: ShallowRef<DraggedEdge | undefined>
	labelEditing: ShallowRef<LabelEditing | undefined>
	/** Ends editing a label with its text; an empty one removes the label. */
	finishLabel: (key: string, text: string) => void
	/** The text card being edited. */
	editing: ShallowRef<string | undefined>
	startEditing: (key: string) => void
	/** The editor's text so far; `finishEditing` saves the last one. */
	draft: (text: string) => void
	finishEditing: () => void
	/** Per node key, bumped by "Reload page" so a link card loads again. */
	reloads: ShallowRef<ReadonlyMap<string, number>>
	/** Lets the user pick another file for a file card. */
	swapFile: (key: string) => void
	/** Saves `patch` into the node at `key`; a key set to `undefined` is removed. */
	updateNode: (key: string, patch: Record<string, unknown>) => void
	/** Adds `node` (with a new id unless it has one) on top and selects it; returns its id. */
	addNode: (node: Record<string, unknown> & { x: number, y: number, width: number, height: number }) => string
	remove: (key: string) => void
	prompt: ShallowRef<CanvasPrompt | undefined>
	menu: ShallowRef<CanvasMenu | undefined>
	closeMenu: () => void
	onPointerDown: (e: PointerEvent) => void
	onPointerMove: (e: PointerEvent) => void
	onPointerLeave: () => void
	onContextMenu: (e: MouseEvent) => void
	onDoubleClick: (e: MouseEvent) => void
	onKeyDown: (e: KeyboardEvent) => void
}

/** Edits a drag makes, created once the drag has started. */
type Edit = Pick<DragHandlers, 'move' | 'end' | 'cancel'>

const SELECTION_PADDING = 10
/** What the pointer works natively on: no drag, select or marquee starts there. */
const INTERACTIVE = 'input, textarea, select, button, a[href], [contenteditable], video, audio'
const HOVER_TOLERANCE = 8
const NUDGE_MULTIPLIER = 5
/** Links offered in a dropped edge's menu. */
const MAX_LINKS = 20
const NO_COLOR = colorBinding(undefined)

/** Line directions, by the ends they give an edge. */
const DIRECTIONS: Array<{ label: string, fromEnd: CanvasEnd, toEnd: CanvasEnd }> = [
	{ label: 'Nondirectional', fromEnd: 'none', toEnd: 'none' },
	{ label: 'Unidirectional', fromEnd: 'none', toEnd: 'arrow' },
	{ label: 'Bidirectional', fromEnd: 'arrow', toEnd: 'arrow' },
]

/** A node side an edge end can attach to. */
interface Attachment {
	node: SceneNode
	side: CanvasSide
}

/** What a dropped edge's menu adds. */
type NewNode = { type: 'text', text: string } | { type: 'file', file: string, subpath?: string }

const translate = (b: BBox, d: Point): BBox => ({ minX: b.minX + d.x, minY: b.minY + d.y, maxX: b.maxX + d.x, maxY: b.maxY + d.y })
const width = (b: BBox) => b.maxX - b.minX
const height = (b: BBox) => b.maxY - b.minY
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
const linkKey = (l: { file?: unknown, subpath?: unknown }) => `${l.file}${l.subpath ?? ''}`

/**
 * `edge` with the ends a line direction gives it, keys in the order Obsidian writes them (ends before color and
 * label); defaults (`fromEnd: none`, `toEnd: arrow`) left out.
 */
function withEnds(edge: JSONCanvasEdge, fromEnd: CanvasEnd, toEnd: CanvasEnd): JSONCanvasEdge {
	const { fromEnd: _from, toEnd: _to, color, label, ...rest } = edge
	return {
		...rest,
		...(fromEnd !== 'none' && { fromEnd }),
		...(toEnd !== 'arrow' && { toEnd }),
		...(color !== undefined && { color }),
		...(label !== undefined && { label }),
	}
}

/** `doc` with the nodes at `indices` set to `boxes` (rounded, as Obsidian stores them). */
function placed(doc: JSONCanvas, indices: readonly number[], boxes: readonly BBox[]): JSONCanvas {
	const nodes = doc.nodes!.slice()
	for (const [k, i] of indices.entries()) {
		const b = boxes[k]!
		nodes[i] = { ...nodes[i]!, x: Math.round(b.minX), y: Math.round(b.minY), width: Math.round(width(b)), height: Math.round(height(b)) }
	}
	return { ...doc, nodes }
}

export function useCanvasInteraction(el: Readonly<Ref<HTMLElement | null>>, editor: CanvasEditor, o: InteractionOptions): CanvasInteraction {
	const { viewport, scene } = editor
	const hovered = ref<string>()
	const marquee = shallowRef<BBox>()
	const guides = shallowRef<SnapGuide[]>([])
	const ghosts = shallowRef<BBox[]>([])
	const dragging = ref(false)
	const connection = shallowRef<DraggedEdge>()
	const labelEditing = shallowRef<LabelEditing>()
	const menu = shallowRef<CanvasMenu>()
	const editing = shallowRef<string>()
	const prompt = shallowRef<CanvasPrompt>()
	const reloads = shallowRef<ReadonlyMap<string, number>>(new Map())
	let draftText: string | undefined

	const world = (p: { clientX: number, clientY: number }) => viewport.screenToWorld(p)
	/** Where a client point is in the canvas element. */
	const local = (p: { clientX: number, clientY: number }) => {
		const r = el.value!.getBoundingClientRect()
		return { x: p.clientX - r.left, y: p.clientY - r.top }
	}
	const selectedItems = computed(() => [...editor.selected.value].flatMap(k => scene.value.byKey.get(k) ?? []))
	const selectedEdges = computed(() => [...editor.selected.value].flatMap(k => scene.value.edgeByKey.get(k) ?? []))
	const selectionBox = computed(() => {
		const items = selectedItems.value
		return items.length > 1 ? growBBox(unionBBox(items.map(i => i.box))!, SELECTION_PADDING) : undefined
	})
	const handlesFor = computed(() => {
		const key = hovered.value
		if (o.readonly() || dragging.value || !key) return
		if (editor.selected.value.size > 1 && editor.selected.value.has(key)) return
		return scene.value.byKey.get(key)
	})

	const autoPan = {
		rect: () => {
			const r = el.value!.getBoundingClientRect()
			return { left: r.left, top: r.top, width: viewport.size.width, height: viewport.size.height }
		},
		panBy: (dx: number, dy: number) => {
			const k = 0.5 / Math.sqrt(viewport.scale.value)
			viewport.panBy(dx * k, dy * k)
		},
	}

	/** Runs a drag whose edits start once it passes the threshold; handles and hovering pause meanwhile. */
	function drag(e: PointerEvent, begin: (p: DragPoint) => Edit | undefined, click?: (p: DragPoint) => void) {
		let edit: Edit | undefined
		const done = () => {
			dragging.value = false
			guides.value = []
			ghosts.value = []
		}
		startDrag(e, {
			start: (p) => {
				dragging.value = true
				edit = begin(p)
			},
			move: p => edit?.move(p),
			end: (p) => {
				done()
				edit?.end(p)
			},
			cancel: () => {
				done()
				edit?.cancel()
			},
			click,
		}, autoPan)
	}

	/** `d` adjusted so `sources` moved by it line up with `targets` (or the grid), unless the no-snap key is held. */
	function snapped(sources: BBox[], d: Point, targets: BBox[], p: DragPoint, axes = { x: true, y: true }): Point {
		if (isNoSnapKey(p)) {
			guides.value = []
			return d
		}
		const r = snap(sources.map(b => translate(b, d)), targets, {
			scale: viewport.scale.value, objects: o.snapToObjects(), grid: o.snapToGrid(), ...axes,
		})
		guides.value = r.guides
		return { x: d.x + r.dx, y: d.y + r.dy }
	}

	/** The selection plus every node fully inside a selected group: what a move carries. */
	function movingItems(): SceneNode[] {
		const items = new Set<SceneNode>()
		for (const item of selectedItems.value) {
			items.add(item)
			if (item.kind !== 'group') continue
			for (const n of scene.value.nodes) {
				if (n !== item && containsBBox(item.box, n.box)) items.add(n)
			}
		}
		return [...items]
	}

	function beginMove(down: DragPoint): Edit | undefined {
		const items = movingItems()
		if (!items.length || o.readonly()) return
		const before = editor.canvas.value
		const moving = new Set(items.map(i => i.node))
		const start = { ...before, nodes: raiseNodes(before.nodes ?? [], moving) }
		const indices = start.nodes.flatMap((n, i) => (moving.has(n) ? [i] : []))
		const boxes = indices.map(i => nodeBox(start.nodes[i]!)!)
		// Snap by the outermost groups when groups move (their contents follow), else by every card.
		const groups = items.filter(i => i.kind === 'group')
		const outer = groups.filter(g => !groups.some(h => h !== g && containsBBox(h.box, g.box) && !containsBBox(g.box, h.box)))
		const sources = (groups.length ? outer : items).map(i => i.box)
		// Groups snap to groups, cards to cards.
		const targets = editor.visibleNodes.value.filter(n => !moving.has(n.node) && (n.kind === 'group') === !!groups.length).map(n => n.box)
		const from = world(down)
		let d: Point = { x: 0, y: 0 }
		let cloning = false
		return {
			move(p) {
				const w = world(p)
				d = { x: w.x - from.x, y: w.y - from.y }
				if (p.shiftKey) d = lockAxis(d)
				d = snapped(sources, d, targets, p, { x: d.x !== 0, y: d.y !== 0 })
				cloning = isCloneKey(p)
				ghosts.value = cloning ? boxes.map(b => translate(b, d)) : []
				editor.preview(cloning ? start : placed(start, indices, boxes.map(b => translate(b, d))))
			},
			end() {
				if (!d.x && !d.y) return editor.preview(before)
				if (!cloning) return editor.commit()
				const { canvas, clones } = cloneNodes(start, indices.map(i => start.nodes[i]!), d)
				editor.commit(canvas)
				editor.select(clones.map(n => n.id as string))
			},
			cancel: () => editor.preview(before),
		}
	}

	function beginResize(items: SceneNode[], frame: BBox, handle: ResizeHandle): Edit | undefined {
		if (o.readonly()) return
		const before = editor.canvas.value
		const indices = items.map(i => before.nodes!.indexOf(i.node))
		const boxes = items.map(i => i.box)
		const single = items.length === 1
		// Small enough that no member gets below the minimum size.
		const min = {
			width: width(frame) * MIN_NODE_SIZE / Math.min(...boxes.map(width)),
			height: height(frame) * MIN_NODE_SIZE / Math.min(...boxes.map(height)),
		}
		const targets = editor.visibleNodes.value.filter(n => !items.includes(n)).map(n => n.box)
		// Images, video and ratio backgrounds keep their shape.
		const locked = single ? editor.aspects.get(items[0]!.key) ?? 0 : 0
		return {
			move(p) {
				const w = world(p)
				const { source, x, y } = resizeSnapSource(handle, w, frame)
				const d = snapped([source], { x: 0, y: 0 }, targets, p, { x, y })
				// Shift keeps a multi-selection's proportions.
				const aspect = single ? locked : p.shiftKey ? width(frame) / height(frame) : 0
				const to = resizeBox(frame, handle, { x: w.x + d.x, y: w.y + d.y }, single ? undefined : min, aspect)
				editor.preview(placed(before, indices, single ? [to] : scaleBoxes(boxes, frame, to)))
			},
			end: () => editor.commit(),
			cancel: () => editor.preview(before),
		}
	}

	function startMarquee(e: PointerEvent) {
		const additive = e.shiftKey
		const initial = editor.selected.value
		if (!additive) editor.select([])
		const from = world(e)
		drag(e, () => ({
			move(p) {
				const w = world(p)
				const rect = { minX: Math.min(from.x, w.x), minY: Math.min(from.y, w.y), maxX: Math.max(from.x, w.x), maxY: Math.max(from.y, w.y) }
				marquee.value = rect
				// A group is picked only when fully enclosed; edges never.
				const hits = scene.value.nodes
					.filter(n => (n.kind === 'group' ? containsBBox(rect, n.box) : intersectsBBox(rect, n.box)))
					.map(n => n.key)
				if (!additive) return editor.select(hits)
				const result = new Set(initial)
				for (const k of hits) {
					if (!result.delete(k)) result.add(k)
				}
				editor.select(result)
			},
			end: () => {
				marquee.value = undefined
			},
			cancel: () => {
				marquee.value = undefined
				editor.select(initial)
			},
		}))
	}

	/** Where an edge end dragged to `p` attaches: the nearest side of a node within reach that `skip` doesn't rule out. */
	function attachment(p: Point, skip: (n: SceneNode) => boolean): Attachment | undefined {
		const reach = growBBox(pointBox(p), CONNECT_DISTANCE)
		const nodes = editor.visibleNodes.value.filter(n => typeof n.node.id === 'string' && intersectsBBox(n.box, reach) && !skip(n))
		const hit = nearestSide(p, nodes.map(n => n.box))
		return hit && { node: nodes[hit.index]!, side: hit.side }
	}

	/** A new edge from `source`'s `side`; dropped away from any node, it opens a menu of what to add there. */
	function beginConnect(source: SceneNode, side: CanvasSide): Edit | undefined {
		const fromNode = source.node.id
		if (o.readonly() || typeof fromNode !== 'string') return
		editor.select([])
		const loose = oppositeSide(side)
		// Not to itself, a group around it, or (from a group) anything in the group.
		const skip = (n: SceneNode) => n === source
			|| (n.kind === 'group' && containsBBox(n.box, source.box))
			|| (source.kind === 'group' && containsBBox(source.box, n.box))
		let target: Attachment | undefined
		return {
			move(p) {
				const w = world(p)
				target = attachment(w, skip)
				connection.value = { shape: edgeGeometry(source.box, side, target?.node.box ?? pointBox(w), target?.side ?? loose), color: NO_COLOR }
			},
			end(p) {
				if (!target) return void openDropMenu(source, side, world(p), p)
				connection.value = undefined
				const doc = editor.canvas.value
				const edge: JSONCanvasEdge = { id: newId(), fromNode, fromSide: side, toNode: target.node.node.id as string, toSide: target.side }
				editor.commit({ ...doc, edges: [...doc.edges ?? [], edge] })
			},
			cancel: () => {
				connection.value = undefined
			},
		}
	}

	/** The menu for an edge from `source` dropped at `at`: add a card, a file, or a note the source links to. */
	async function openDropMenu(source: SceneNode, side: CanvasSide, at: Point, client: DragPoint) {
		const host = o.host(), doc = editor.canvas.value
		const fromNode = source.node.id as string
		const loose = oppositeSide(side)
		let links: CanvasLink[] = []
		if (source.kind === 'file' && host?.listLinks) {
			const byId = new Map((doc.nodes ?? []).map(n => [n.id, n]))
			const connected = new Set((doc.edges ?? []).flatMap((e) => {
				const n = e.fromNode === fromNode ? byId.get(e.toNode) : undefined
				return n?.type === 'file' ? [linkKey(n)] : []
			}))
			try {
				links = (await host.listLinks(source.node.file as string)).filter(l => !connected.has(linkKey(l))).slice(0, MAX_LINKS)
			}
			catch (error) {
				connection.value = undefined
				throw error
			}
		}
		let chosen = false
		/** Adds what `pick` gives (nothing if it gives nothing), its `loose` side's midpoint on the drop point, connected. */
		const add = (pick: () => NewNode | undefined | Promise<NewNode | undefined>) => async () => {
			chosen = true
			try {
				const fields = await pick()
				if (!fields) return
				const b = boxAtSide(at, NODE_SIZE[fields.type], loose)
				const node = { id: newId(), x: Math.round(b.minX), y: Math.round(b.minY), width: width(b), height: height(b), ...fields }
				const now = editor.canvas.value
				editor.commit({
					...now,
					nodes: [...now.nodes ?? [], node],
					edges: [...now.edges ?? [], { id: newId(), fromNode, fromSide: side, toNode: node.id, toSide: loose }],
				})
				editor.select([node.id])
			}
			finally {
				connection.value = undefined
			}
		}
		const { pickFile } = host ?? {}
		const actions: DropdownMenuItem[] = [{ label: 'Add card', icon: 'i-lucide-sticky-note', onSelect: add(() => ({ type: 'text', text: '' })) }]
		if (pickFile) {
			actions.push({ label: 'Add file', icon: 'i-lucide-file-plus', onSelect: add(async () => {
				const file = await pickFile()
				return file ? { type: 'file', file } : undefined
			}) })
		}
		const linkItems: DropdownMenuItem[] = links.map(l => ({
			label: linkKey(l),
			icon: 'i-lucide-file',
			onSelect: add(() => ({ type: 'file', file: l.file, ...(l.subpath && { subpath: l.subpath }) })),
		}))
		menu.value = {
			...local(client),
			items: linkItems.length ? [actions, linkItems] : [actions],
			onClose: () => {
				if (!chosen) connection.value = undefined
			},
		}
	}

	/** Moves the end of `item` nearer to `down`; dropped away from any node, the edge is removed. */
	function beginReconnect(item: SceneEdge, down: Point): Edit | undefined {
		if (o.readonly()) return
		editor.select([])
		const { edge } = item
		const end = distance(down, item.shape.start) > distance(down, item.shape.end) ? 'to' : 'from'
		const fixed = end === 'to' ? edge.fromNode : edge.toNode
		const before = editor.canvas.value
		const without = { ...before, edges: before.edges!.filter(e => e !== edge) }
		editor.preview(without)
		let target: Attachment | undefined
		return {
			move(p) {
				const w = world(p)
				target = attachment(w, n => n.node.id === fixed)
				const box = target?.node.box ?? pointBox(w)
				const shape = end === 'to'
					? edgeGeometry(item.from, edge.fromSide!, box, target?.side ?? edge.toSide!, edge.fromEnd, edge.toEnd)
					: edgeGeometry(box, target?.side ?? edge.fromSide!, item.to, edge.toSide!, edge.fromEnd, edge.toEnd)
				connection.value = { shape, color: item.color }
			},
			end() {
				connection.value = undefined
				if (!target) return editor.commit(without)
				const moved = { ...edge, [`${end}Node`]: target.node.node.id as string, [`${end}Side`]: target.side }
				editor.commit({ ...before, edges: before.edges!.map(e => (e === edge ? moved : e)) })
			},
			cancel() {
				connection.value = undefined
				editor.preview(before)
			},
		}
	}

	function toggle(key: string) {
		const next = new Set(editor.selected.value)
		if (!next.delete(key)) next.add(key)
		editor.select(next)
	}

	function editLabel(key: string, at?: LabelEditing['at']) {
		if (!o.readonly()) labelEditing.value = { key, at }
	}

	/** Ends editing an edge's or a group's label; an empty label is removed. */
	function finishLabel(key: string, text: string) {
		labelEditing.value = undefined
		const edge = scene.value.edgeByKey.get(key)?.edge
		const item: { label?: unknown } | undefined = edge ?? scene.value.byKey.get(key)?.node
		const label = text.trim()
		if (!item || label === (item.label ?? '')) return
		const { label: _, ...rest } = item
		const next = label ? { ...item, label } : rest
		const doc = editor.canvas.value
		editor.commit(edge
			? { ...doc, edges: doc.edges!.map(e => (e === edge ? next as JSONCanvasEdge : e)) }
			: { ...doc, nodes: doc.nodes!.map(n => (n === item ? next as typeof n : n)) })
	}

	function startEditing(key: string) {
		const item = scene.value.byKey.get(key)
		if (o.readonly() || !item || editing.value === key) return
		if (item.kind !== 'text' && !o.customTypes().has(String(item.node.type))) return
		finishEditing()
		editor.select([key])
		draftText = undefined
		editing.value = key
		// Too small to edit: zoom in on it, as Obsidian does.
		if (editor.contentHidden.value) viewport.zoomToBBox(item.box)
	}

	function finishEditing() {
		const key = editing.value
		if (key === undefined) return
		editing.value = undefined
		const item = scene.value.byKey.get(key), text = draftText
		draftText = undefined
		if (!item || text === undefined || text === item.node.text) return
		const doc = editor.canvas.value
		editor.commit({ ...doc, nodes: doc.nodes!.map(n => (n === item.node ? { ...n, text } : n)) })
	}

	/** Opens what a file or link card shows: the file in the host, the page in a browser tab. */
	function openNode(item: SceneNode, newTab: boolean) {
		const n = item.node
		if (item.kind === 'file') o.host()?.openFile?.(n.file as string, n.subpath as string | undefined, newTab)
		else if (item.kind === 'link') window.open(n.url as string, '_blank', 'noopener,noreferrer')
	}

	/**
	 * Fits a text or note card to its content: its height (`bottom`), or the narrowest width that wraps no more lines
	 * than now (`right`), measured in the DOM as Obsidian does.
	 */
	function fitToContent(key: string, side: 'bottom' | 'right') {
		const item = scene.value.byKey.get(key)
		const nodeEl = el.value?.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`)
		const content = nodeEl?.querySelector<HTMLElement>('.jc-text:not(.jc-editing), .jc-file-markdown')
		if (o.readonly() || !item || !nodeEl || !content) return
		/** How tall the content would be with no height to fit in. */
		const natural = () => {
			const h = content.style.height
			content.style.height = '1px'
			const full = content.scrollHeight
			content.style.height = h
			return full
		}
		const box = { ...item.box }
		if (side === 'bottom') {
			box.maxY = box.minY + Math.max(MIN_NODE_SIZE, Math.round(height(box) + natural() - content.clientHeight))
		}
		else {
			const target = natural() + 0.1, w = nodeEl.style.width
			let lo = MIN_NODE_SIZE, hi = width(box)
			for (let i = 0; i < 10 && hi - lo > 1; i++) {
				const mid = Math.round((lo + hi) / 2)
				nodeEl.style.width = `${mid}px`
				if (natural() > target) lo = mid
				else hi = mid
			}
			nodeEl.style.width = w
			box.maxX = box.minX + hi
		}
		const doc = editor.canvas.value
		editor.commit(placed(doc, [doc.nodes!.indexOf(item.node)], [box]))
	}

	function onDoubleClick(e: MouseEvent) {
		const target = e.target as Element
		if (target.closest(INTERACTIVE) || target.closest('[data-connect]')) return
		const handle = target.closest<HTMLElement>('[data-resize]')
		if (handle) {
			const side = handle.dataset.resize
			if (handle.dataset.owner && (side === 'bottom' || side === 'right')) fitToContent(handle.dataset.owner, side)
			return
		}
		const key = target.closest<HTMLElement>('[data-key]')?.dataset.key
		const item = key ? scene.value.byKey.get(key) : undefined
		if (!item) return
		if (target.closest('.jc-group-label')) editLabel(item.key)
		else if (target.closest('.jc-node-label')) openNode(item, false)
		else if (item.kind === 'text' || o.customTypes().has(String(item.node.type))) startEditing(item.key)
	}

	function swapFile(key: string) {
		const pick = o.host()?.pickFile
		if (!pick || o.readonly()) return
		void pick().then((path) => {
			const item = scene.value.byKey.get(key)
			if (!path || !item) return
			const doc = editor.canvas.value
			const { subpath: _, ...node } = item.node
			editor.commit({ ...doc, nodes: doc.nodes!.map(n => (n === item.node ? { ...node, file: path } : n)) })
		})
	}

	function reload(key: string) {
		const next = new Map(reloads.value)
		next.set(key, (next.get(key) ?? 0) + 1)
		reloads.value = next
	}

	function changeUrl(item: SceneNode) {
		prompt.value = {
			title: 'Enter URL',
			value: item.node.url as string,
			validate: (v) => {
				try {
					new URL(v)
				}
				catch {
					return 'Invalid URL'
				}
			},
			submit: (url) => {
				const doc = editor.canvas.value
				editor.commit({ ...doc, nodes: doc.nodes!.map(n => (n === item.node ? { ...n, url } : n)) })
			},
		}
	}

	/** A card's own items in its context menu. */
	function nodeMenu(item: SceneNode): DropdownMenuItem[] {
		const edit = !o.readonly(), host = o.host(), n = item.node
		const items: Array<DropdownMenuItem | false | undefined> = item.kind === 'text'
			? [edit && { label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => startEditing(item.key) }]
			: item.kind === 'group'
				? [edit && { label: 'Edit label', icon: 'i-lucide-pencil', onSelect: () => editLabel(item.key) }]
				: item.kind === 'file'
					? [
							edit && !!host?.pickFile && { label: 'Swap file', icon: 'i-lucide-repeat', onSelect: () => swapFile(item.key) },
							!!host?.openFile && fileKind(n.file as string) === 'markdown' && { label: 'Open in new tab', icon: 'i-lucide-file-plus', onSelect: () => openNode(item, true) },
						]
					: item.kind === 'link'
						? [
								edit && { label: 'Change URL', icon: 'i-lucide-link', onSelect: () => changeUrl(item) },
								{ label: 'Open in browser', icon: 'i-lucide-globe', onSelect: () => openNode(item, true) },
								{ label: 'Copy URL', icon: 'i-lucide-copy', onSelect: () => void navigator.clipboard.writeText(n.url as string) },
								{ label: 'Reload page', icon: 'i-lucide-rotate-ccw', onSelect: () => reload(item.key) },
							]
						: []
		return items.filter(i => !!i)
	}

	/** A click on an edge (or its label, `at`) selects it; on the only selected edge, edits its label. */
	function clickEdge(key: string, p: DragPoint, at?: LabelEditing['at']) {
		const sel = editor.selected.value
		if (p.shiftKey) toggle(key)
		else if (sel.size === 1 && sel.has(key)) editLabel(key, at)
		else editor.select([key])
	}

	function setLineDirection(edges: readonly JSONCanvasEdge[], fromEnd: CanvasEnd, toEnd: CanvasEnd) {
		const doc = editor.canvas.value
		editor.commit({ ...doc, edges: doc.edges!.map(e => (edges.includes(e as JSONCanvasEdge) ? withEnds(e as JSONCanvasEdge, fromEnd, toEnd) : e)) })
	}

	function onContextMenu(e: MouseEvent) {
		const target = e.target as Element
		if (target.closest(INTERACTIVE)) return
		const sel = editor.selected.value
		const nodeKey = target.closest<HTMLElement>('[data-key]')?.dataset.key
		const node = nodeKey ? scene.value.byKey.get(nodeKey) : undefined
		if (node) {
			e.preventDefault()
			// ponytail: a node in a multi-selection gets no menu, nor any node Zoom/Remove items, until C6's menus.
			if (sel.size > 1 && sel.has(node.key)) return
			if (!o.readonly()) editor.select([node.key])
			const items = nodeMenu(node)
			if (items.length) menu.value = { ...local(e), items: [items] }
			return
		}
		const key = target.closest<HTMLElement>('[data-edge]')?.dataset.edge
		const item = key && scene.value.edgeByKey.get(key)
		if (!item) return
		e.preventDefault()
		// ponytail: an edge in a multi-selection gets no menu until the selection menu (C6).
		if (editor.selected.value.size > 1 && editor.selected.value.has(key)) return
		const edit = !o.readonly()
		if (edit) editor.select([key])
		const { edge } = item
		const at = world(e)
		const far = distance(at, item.shape.start) < distance(at, item.shape.end) ? item.to : item.from
		const follow: DropdownMenuItem = { label: 'Follow connection', icon: 'i-lucide-corner-down-right', onSelect: () => viewport.zoomToBBox(far) }
		const fromEnd = edge.fromEnd ?? 'none', toEnd = edge.toEnd ?? 'arrow'
		menu.value = {
			...local(e),
			items: edit
				? [
						[
							{ label: 'Edit label', icon: 'i-lucide-pencil', onSelect: () => editLabel(key) },
							{
								label: 'Line direction',
								icon: 'i-lucide-move-horizontal',
								children: DIRECTIONS.map(d => ({
									label: d.label,
									type: 'checkbox' as const,
									checked: d.fromEnd === fromEnd && d.toEnd === toEnd,
									onSelect: () => setLineDirection([edge], d.fromEnd, d.toEnd),
								})),
							},
							follow,
						],
						[{ label: 'Remove', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => remove(new Set(), new Set([edge])) }],
					]
				: [[follow]],
		}
	}

	function closeMenu() {
		const m = menu.value
		menu.value = undefined
		m?.onClose?.()
	}

	function onPointerDown(e: PointerEvent) {
		const target = e.target as Element
		const pressed = target.closest<HTMLElement>('[data-key]')?.dataset.key
		// The card being edited is the editor's; a press anywhere else ends editing.
		if (editing.value !== undefined && pressed === editing.value) return
		const interactive = !!target.closest(INTERACTIVE)
		// The keyboard goes to the canvas, unless the press is in something that takes it.
		if (!interactive) el.value?.focus({ preventScroll: true })
		if (viewport.onPointerDown(e) || e.button !== 0) return
		finishEditing()
		if (interactive) return
		const connect = target.closest<HTMLElement>('[data-connect]')
		const source = connect && scene.value.byKey.get(connect.parentElement!.dataset.owner!)
		if (source) return drag(e, () => beginConnect(source, connect.dataset.connect as CanvasSide), () => editor.select([source.key]))
		const edgeEl = target.closest<HTMLElement>('[data-edge]')
		const edge = edgeEl && scene.value.edgeByKey.get(edgeEl.dataset.edge!)
		if (edge) {
			// A label can be clicked into but not dragged.
			const onLabel = edgeEl.classList.contains('jc-edge-label')
			return drag(e, () => (onLabel ? undefined : beginReconnect(edge, world(e))), p => clickEdge(edge.key, p, onLabel ? { x: p.clientX, y: p.clientY } : undefined))
		}
		const handle = target.closest<HTMLElement>('[data-resize]')
		if (handle) {
			const h = handle.dataset.resize as ResizeHandle
			const owner = handle.dataset.owner
			if (owner) {
				const item = scene.value.byKey.get(owner)
				if (item) {
					const select = () => editor.select([owner])
					drag(e, () => {
						select()
						return beginResize([item], item.box, h)
					}, select)
				}
			}
			else if (selectionBox.value) {
				drag(e, () => beginResize(selectedItems.value, selectionBox.value!, h))
			}
			return
		}
		// Moves measure from where the button went down, not from where the drag passed its threshold.
		if (target.closest('.jc-selection')) return drag(e, () => beginMove(e))
		const key = pressed
		const item = key ? scene.value.byKey.get(key) : undefined
		if (!key || !item) return startMarquee(e)
		const sel = editor.selected.value
		const focused = sel.size === 1 && sel.has(key)
		drag(
			e,
			() => {
				if (!editor.selected.value.has(key)) editor.select([key])
				return beginMove(e)
			},
			(p) => {
				if (p.shiftKey) return toggle(key)
				editor.select([key])
				// Mod+click on a card's name, or a click on an already focused card's content, opens what it shows.
				if (target.closest('.jc-node-label') ? isMod(p) : focused && target.closest('[data-open]')) openNode(item, isMod(p))
			},
		)
	}

	function onPointerMove(e: PointerEvent) {
		if (dragging.value || (e.target as Element).closest('.jc-handles')) return // keep the node while on its handles
		const p = world(e), tol = HOVER_TOLERANCE / viewport.scale.value
		const nodes = editor.visibleNodes.value
		let hit: string | undefined
		for (let i = nodes.length - 1; i >= 0 && !hit; i--) {
			const b = nodes[i]!.box
			if (p.x >= b.minX - tol && p.x <= b.maxX + tol && p.y >= b.minY - tol && p.y <= b.maxY + tol) hit = nodes[i]!.key
		}
		hovered.value = hit
	}

	function nudge(dx: number, dy: number) {
		const items = movingItems()
		const doc = editor.canvas.value
		const indices = items.map(i => doc.nodes!.indexOf(i.node))
		editor.commit(placed(doc, indices, items.map(i => translate(i.box, { x: dx, y: dy }))))
	}

	function remove(nodes: ReadonlySet<SceneNode['node']>, edges: ReadonlySet<JSONCanvasEdge>) {
		if (!nodes.size && !edges.size) return
		editor.commit(removeFromCanvas(editor.canvas.value, nodes, edges))
		editor.select([])
	}

	const ARROWS: Record<string, Point> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } }

	function onKeyDown(e: KeyboardEvent) {
		if (e.target !== el.value || dragging.value) return // keys typed inside a card aren't the canvas's
		const key = e.key.toLowerCase(), edit = !o.readonly()
		let handled = true
		if (isMod(e) && (key === 'y' || (key === 'z' && e.shiftKey))) {
			if (edit) editor.redo()
		}
		else if (isMod(e) && key === 'z') {
			if (edit) editor.undo()
		}
		else if (isMod(e) && key === 'a') {
			editor.select(scene.value.nodes.map(n => n.key))
		}
		else if (e.shiftKey && e.code === 'Digit1') {
			editor.zoomToFit()
		}
		else if (e.shiftKey && e.code === 'Digit2') {
			editor.zoomToSelection()
		}
		else if (e.key === 'Delete' || e.key === 'Backspace') {
			if (edit) remove(new Set(selectedItems.value.map(i => i.node)), new Set(selectedEdges.value.map(i => i.edge)))
		}
		else if (ARROWS[e.key] && !isMod(e)) {
			const step = gridSpacing(viewport.view.zoom) * (e.shiftKey ? NUDGE_MULTIPLIER : 1)
			if (edit) nudge(ARROWS[e.key]!.x * step, ARROWS[e.key]!.y * step)
		}
		else {
			handled = false
		}
		if (handled) e.preventDefault()
	}

	return {
		hovered, handlesFor, selectionBox, marquee, guides, ghosts, connection, labelEditing, finishLabel, menu, closeMenu,
		editing, startEditing, finishEditing, reloads, swapFile, prompt,
		updateNode(key, patch) {
			const item = scene.value.byKey.get(key)
			if (!item || o.readonly()) return
			const node = Object.fromEntries(Object.entries({ ...item.node, ...patch }).filter(([, v]) => v !== undefined))
			const doc = editor.canvas.value
			editor.commit({ ...doc, nodes: doc.nodes!.map(n => (n === item.node ? node : n)) })
		},
		addNode(fields) {
			const node = { id: newId(), ...fields }
			const doc = editor.canvas.value
			editor.commit({ ...doc, nodes: [...doc.nodes ?? [], node] })
			editor.select([String(node.id)])
			return String(node.id)
		},
		draft: (text) => {
			draftText = text
		},
		remove: (key) => {
			const item = scene.value.byKey.get(key)
			if (item && !o.readonly()) remove(new Set([item.node]), new Set())
		},
		onPointerDown, onPointerMove, onContextMenu, onDoubleClick, onKeyDown,
		onPointerLeave: () => {
			hovered.value = undefined
		},
	}
}
