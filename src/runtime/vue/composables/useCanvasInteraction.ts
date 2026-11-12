import { computed, ref, shallowRef, type ComputedRef, type Ref, type ShallowRef } from 'vue'
import {
	cloneNodes, containsBBox, gridSpacing, growBBox, intersectsBBox, lockAxis, MIN_NODE_SIZE, nodeBox, raiseNodes,
	removeFromCanvas, resizeBox, resizeSnapSource, scaleBoxes, snap, unionBBox,
	type BBox, type JSONCanvas, type Point, type ResizeHandle, type SnapGuide,
} from '../../core'
import { startDrag, type DragHandlers, type DragPoint } from '../utils/drag'
import { isCloneKey, isMod, isNoSnapKey } from '../utils/platform'
import type { CanvasEditor, SceneNode } from './useCanvasEditor'

export interface InteractionOptions {
	readonly: () => boolean
	snapToGrid: () => boolean
	snapToObjects: () => boolean
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
	onPointerDown: (e: PointerEvent) => void
	onPointerMove: (e: PointerEvent) => void
	onPointerLeave: () => void
	onKeyDown: (e: KeyboardEvent) => void
}

/** Edits a drag makes, created once the drag has started. */
type Edit = Pick<DragHandlers, 'move' | 'end' | 'cancel'>

const SELECTION_PADDING = 10
const HOVER_TOLERANCE = 8
const NUDGE_MULTIPLIER = 5

const translate = (b: BBox, d: Point): BBox => ({ minX: b.minX + d.x, minY: b.minY + d.y, maxX: b.maxX + d.x, maxY: b.maxY + d.y })
const width = (b: BBox) => b.maxX - b.minX
const height = (b: BBox) => b.maxY - b.minY

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

	const world = (p: { clientX: number, clientY: number }) => viewport.screenToWorld(p)
	const selectedItems = computed(() => [...editor.selected.value].flatMap(k => scene.value.byKey.get(k) ?? []))
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
		return {
			move(p) {
				const w = world(p)
				const { source, x, y } = resizeSnapSource(handle, w, frame)
				const d = snapped([source], { x: 0, y: 0 }, targets, p, { x, y })
				// Shift keeps a multi-selection's proportions. (Images and video keep theirs once C5 knows their size.)
				const aspect = !single && p.shiftKey ? width(frame) / height(frame) : 0
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

	function onPointerDown(e: PointerEvent) {
		if (viewport.onPointerDown(e) || e.button !== 0) return
		const target = e.target as Element
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
		const key = target.closest<HTMLElement>('[data-key]')?.dataset.key
		if (!key) return startMarquee(e)
		drag(
			e,
			() => {
				if (!editor.selected.value.has(key)) editor.select([key])
				return beginMove(e)
			},
			(p) => {
				if (!p.shiftKey) return editor.select([key])
				const next = new Set(editor.selected.value)
				if (!next.delete(key)) next.add(key)
				editor.select(next)
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

	function remove() {
		const nodes = new Set(selectedItems.value.map(i => i.node))
		if (!nodes.size) return
		editor.commit(removeFromCanvas(editor.canvas.value, nodes))
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
			if (edit) remove()
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
		hovered, handlesFor, selectionBox, marquee, guides, ghosts,
		onPointerDown, onPointerMove, onKeyDown,
		onPointerLeave: () => {
			hovered.value = undefined
		},
	}
}
