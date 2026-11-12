import { computed, onBeforeUnmount, onMounted, reactive, ref, type ComputedRef, type Ref } from 'vue'
import { clampZoom, fitViewport, viewportToWorld, zoomViewport, type BBox, type Point, type Viewport } from '../../core'
import { IS_MAC } from '../utils/platform'

export type WheelBehavior = 'pan' | 'zoom'

export interface ViewportOptions {
	/** What a plain wheel does; the other happens with Mod or Space held. */
	wheelBehavior: () => WheelBehavior
	/** The view is first measured; the place to show something. */
	onReady: () => void
	/** The view came to rest after moving. */
	onSettled: (v: Viewport) => void
}

/** A view of the canvas and the gestures that move it. */
export interface ViewportController {
	/** Where the view is now (changes every frame while it moves). */
	view: Viewport
	/** The view's size in screen px. */
	size: { width: number, height: number }
	scale: ComputedRef<number>
	/** `view.zoom`, updated only once the view is at rest. */
	settledZoom: Ref<number>
	spaceHeld: Ref<boolean>
	/** A pan drag is in progress. */
	panning: Ref<boolean>
	/** The view moves, or moved in the last moments. */
	moving: Ref<boolean>
	/** Jumps to `v`. */
	setViewport: (v: Viewport) => void
	/** Zooms by `dz` (log2 units), keeping the world point under `at` (screen px from the centre) in place. */
	zoomBy: (dz: number, at?: Point) => void
	/** Moves the view by world units, at once. */
	panBy: (dx: number, dy: number) => void
	/** Animates to show `box`; `jump` skips the animation. */
	zoomToBBox: (box: BBox, jump?: boolean) => void
	screenToWorld: (e: { clientX: number, clientY: number }) => Point
	onWheel: (e: WheelEvent) => void
	/** Starts a pan for middle, right and Space+left drags; returns whether it did. */
	onPointerDown: (e: PointerEvent) => boolean
	onContextMenu: (e: MouseEvent) => void
	onKeyDown: (e: KeyboardEvent) => void
	onKeyUp: (e: KeyboardEvent) => void
}

const EASE = 0.984
const EPSILON = 0.01
const WHEEL_PAN = 0.93
const WHEEL_ZOOM = 300
/**
 * Keeps the view "moving" a moment after a wheel step or drag, so the next one continues the same movement:
 * zoom-dependent styles change and the view is reported once, and the compositor layer stays.
 */
const MOVE_PAUSE = 200
const DRAG_THRESHOLD = 5

/**
 * The view of the canvas inside `el`: where it is, its animation toward a target, and the wheel, drag and Space
 * gestures that move it. `view` is the current state; `settledZoom` only changes once the view is at rest.
 */
export function useViewport(el: Readonly<Ref<HTMLElement | null>>, o: ViewportOptions): ViewportController {
	const view = reactive<Viewport>({ x: 0, y: 0, zoom: 0 })
	const size = reactive({ width: 0, height: 0 })
	const settledZoom = ref(0)
	const spaceHeld = ref(false)
	const panning = ref(false)
	/** The view is moving, or moved in the last moments; it gets a compositor layer only meanwhile. */
	const moving = ref(false)
	const scale = computed(() => 2 ** view.zoom)

	const target: Viewport = { x: 0, y: 0, zoom: 0 }
	/** Screen offset from the view's centre that stays on the same world point while zooming. */
	let anchor: Point | undefined
	let instant = false
	let pauseUntil = 0
	let frameId = 0
	let lastFrame = 0

	function request() {
		moving.value = true
		frameId ||= requestAnimationFrame(frame)
	}

	function frame(now: number) {
		frameId = 0
		const dt = lastFrame ? now - lastFrame : 16
		lastFrame = now
		let m = instant ? 1 : 1 - EASE ** dt
		instant = false
		target.zoom = clampZoom(target.zoom)
		const dz = target.zoom - view.zoom
		// Panning eases only alongside a zoom; on its own it lands at once.
		if (Math.abs(dz) < EPSILON) m = 1
		if (dz !== 0) {
			Object.assign(view, zoomViewport(view, m === 1 ? target.zoom : view.zoom + dz * m, anchor))
			if (anchor) Object.assign(target, { x: view.x, y: view.y })
		}
		view.x = Math.abs(target.x - view.x) < EPSILON ? target.x : view.x + (target.x - view.x) * m
		view.y = Math.abs(target.y - view.y) < EPSILON ? target.y : view.y + (target.y - view.y) * m
		const settled = view.zoom === target.zoom && view.x === target.x && view.y === target.y
		if (!settled || now < pauseUntil) return request()
		lastFrame = 0
		anchor = undefined
		moving.value = false
		settledZoom.value = view.zoom
		o.onSettled({ ...view })
	}

	/** Jumps to `v` without animating. */
	function setViewport(v: Viewport) {
		Object.assign(target, { ...v, zoom: clampZoom(v.zoom) })
		anchor = undefined
		instant = true
		request()
	}

	/** Zooms by `dz` (log2 units), keeping the world point under `at` (screen px from the centre) in place. */
	function zoomBy(dz: number, at?: Point) {
		target.zoom = clampZoom(target.zoom + dz)
		anchor = at
		request()
	}

	/** Moves the view by world units, at once. */
	function panBy(dx: number, dy: number) {
		view.x += dx
		view.y += dy
		target.x += dx
		target.y += dy
		pauseUntil = performance.now() + MOVE_PAUSE
		request()
	}

	/** Animates to show `box`; `instant` jumps there. */
	function zoomToBBox(box: BBox, jump = false) {
		if (!size.width || !size.height) return
		Object.assign(target, fitViewport(box, size.width, size.height))
		anchor = undefined
		instant = jump
		request()
	}

	/** Screen px from the view's centre for a pointer event. */
	function fromCenter(e: { clientX: number, clientY: number }): Point {
		const r = el.value!.getBoundingClientRect()
		return { x: e.clientX - r.left - size.width / 2, y: e.clientY - r.top - size.height / 2 }
	}

	const screenToWorld = (e: { clientX: number, clientY: number }): Point => viewportToWorld(view, fromCenter(e))

	function onWheel(e: WheelEvent) {
		if (e.defaultPrevented) return
		e.preventDefault()
		let zoom = e.ctrlKey || e.metaKey || spaceHeld.value
		if (o.wheelBehavior() === 'zoom') zoom = !zoom
		const k = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1
		const dx = e.deltaX * k, dy = e.deltaY * k
		if (zoom) {
			// A trackpad pinch arrives as Ctrl+wheel with fractional deltas, smaller than a wheel's.
			const dz = (-dy / WHEEL_ZOOM) * (IS_MAC && !Number.isInteger(dy) ? 2 : 1)
			zoomBy(dz, dy < 0 ? fromCenter(e) : undefined)
			pauseUntil = performance.now() + MOVE_PAUSE
		}
		else if (e.shiftKey && dx === 0) {
			panBy((dy / scale.value) * WHEEL_PAN, 0)
		}
		else {
			panBy((dx / scale.value) * WHEEL_PAN, (dy / scale.value) * WHEEL_PAN)
		}
	}

	/**
	 * Right-drag pans, so a menu may only open for a right click without a drag. macOS fires `contextmenu` on press,
	 * others on release: during a press it's held back and, if the press ends without a drag, sent again (as an
	 * untrusted event, so no native menu); after a drag, the one that follows the release is dropped.
	 */
	let rightPress: { held: boolean } | undefined
	let dropNextMenu = false

	/** Starts a pan for middle, right and Space+left drags; returns whether it did. */
	function onPointerDown(e: PointerEvent): boolean {
		const right = e.button === 2
		if (!(e.button === 1 || right || (e.button === 0 && spaceHeld.value))) return false
		if (!right) e.preventDefault() // no autoscroll on middle click
		const press = right ? (rightPress = { held: false }) : undefined
		const start = { x: e.clientX, y: e.clientY }
		let last = start, moved = !right
		const move = (ev: PointerEvent) => {
			if (ev.pointerId !== e.pointerId) return
			if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < DRAG_THRESHOLD) return
			moved = panning.value = true
			panBy((last.x - ev.clientX) / scale.value, (last.y - ev.clientY) / scale.value)
			last = { x: ev.clientX, y: ev.clientY }
		}
		const end = (ev: PointerEvent) => {
			if (ev.pointerId !== e.pointerId) return
			window.removeEventListener('pointermove', move)
			window.removeEventListener('pointerup', end)
			window.removeEventListener('pointercancel', end)
			if (press) {
				rightPress = undefined
				if (panning.value) dropNextMenu = !press.held
				else if (press.held) {
					const { clientX, clientY, screenX, screenY, ctrlKey, shiftKey, altKey, metaKey } = ev
					e.target?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX, clientY, screenX, screenY, ctrlKey, shiftKey, altKey, metaKey }))
				}
			}
			panning.value = false
		}
		window.addEventListener('pointermove', move)
		window.addEventListener('pointerup', end)
		window.addEventListener('pointercancel', end)
		return true
	}

	/** Listen in the capture phase, so nothing inside sees a menu event that's held back or dropped. */
	function onContextMenu(e: MouseEvent) {
		if (!e.isTrusted) return
		if (rightPress) {
			rightPress.held = true
			e.preventDefault()
			e.stopImmediatePropagation()
		}
		else if (dropNextMenu) {
			dropNextMenu = false
			e.preventDefault()
			e.stopImmediatePropagation()
		}
	}

	function onKeyDown(e: KeyboardEvent) {
		if (e.key !== ' ' || e.target !== el.value) return
		e.preventDefault()
		spaceHeld.value = true
	}

	function onKeyUp(e: KeyboardEvent) {
		if (e.key === ' ') spaceHeld.value = false
	}

	let observer: ResizeObserver | undefined
	onMounted(() => {
		observer = new ResizeObserver(([entry]) => {
			const first = !size.width
			size.width = entry!.contentRect.width
			size.height = entry!.contentRect.height
			if (first && size.width) o.onReady()
		})
		observer.observe(el.value!)
	})
	onBeforeUnmount(() => {
		observer?.disconnect()
		cancelAnimationFrame(frameId)
	})

	return {
		view, size, scale, settledZoom, spaceHeld, panning, moving,
		setViewport, zoomBy, panBy, zoomToBBox, screenToWorld,
		onWheel, onPointerDown, onContextMenu, onKeyDown, onKeyUp,
	}
}
