import type { Modifiers } from './platform'

/** Where the pointer is and which modifiers are held: a drag's state at any moment. */
export interface DragPoint extends Modifiers {
	clientX: number
	clientY: number
}

export interface DragHandlers {
	/** The pointer moved past the threshold. */
	start?: (p: DragPoint) => void
	/** The pointer moved, a modifier changed, or the view auto-panned. */
	move: (p: DragPoint) => void
	end: (p: DragPoint) => void
	/** Escape, a second pointer, or a context menu: undo what the drag did. */
	cancel: () => void
	/** Released before the threshold: a click. */
	click?: (p: DragPoint) => void
}

export interface AutoPan {
	/** The viewport's rect on screen. */
	rect: () => { left: number, top: number, width: number, height: number }
	/** Pans by screen px; the drag's `move` runs after each step so what's dragged follows. */
	panBy: (dx: number, dy: number) => void
}

const THRESHOLD = 5
const EDGE = 30
const MAX_SPEED = 40

const point = (e: PointerEvent | KeyboardEvent, at: DragPoint): DragPoint =>
	({ clientX: 'clientX' in e ? e.clientX : at.clientX, clientY: 'clientY' in e ? e.clientY : at.clientY, shiftKey: e.shiftKey, altKey: e.altKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey })

/**
 * Follows a primary-button drag from `down` until release, on `window`. It starts after 5 px; before that a
 * release is a click. Modifier presses re-run `move`, so they apply without moving the pointer. With `autoPan`,
 * holding the pointer within 30 px of the view's edge pans it.
 */
export function startDrag(down: PointerEvent, h: DragHandlers, autoPan?: AutoPan): () => void {
	let last = point(down, down as unknown as DragPoint)
	let started = false
	let timer: ReturnType<typeof setInterval> | undefined

	const pan = () => {
		const r = autoPan!.rect()
		const over = (v: number, min: number, max: number) => Math.max(-MAX_SPEED, Math.min(MAX_SPEED, v < min ? v - min : v > max ? v - max : 0))
		const vx = over(last.clientX, r.left + EDGE, r.left + r.width - EDGE), vy = over(last.clientY, r.top + EDGE, r.top + r.height - EDGE)
		if (!vx && !vy) {
			clearInterval(timer)
			timer = undefined
			return
		}
		autoPan!.panBy(vx, vy)
		h.move(last)
	}

	const onMove = (e: PointerEvent) => {
		if (e.pointerId !== down.pointerId) return
		last = point(e, last)
		if (!started) {
			if (Math.hypot(e.clientX - down.clientX, e.clientY - down.clientY) < THRESHOLD) return
			started = true
			h.start?.(last)
		}
		h.move(last)
		if (autoPan && !timer) {
			timer = setInterval(pan, 1000 / 60)
			pan()
		}
	}
	const onUp = (e: PointerEvent) => {
		if (e.pointerId !== down.pointerId) return
		last = point(e, last)
		cleanup()
		if (started) h.end(last)
		else h.click?.(last)
	}
	const onCancel = () => {
		cleanup()
		if (started) h.cancel()
	}
	const onKey = (e: KeyboardEvent) => {
		if (e.type === 'keydown' && e.key === 'Escape') {
			e.preventDefault()
			return onCancel()
		}
		last = point(e, last)
		if (started) h.move(last)
	}
	function cleanup() {
		clearInterval(timer)
		window.removeEventListener('pointermove', onMove)
		window.removeEventListener('pointerup', onUp)
		window.removeEventListener('pointercancel', onCancel)
		window.removeEventListener('contextmenu', onCancel)
		window.removeEventListener('keydown', onKey)
		window.removeEventListener('keyup', onKey)
	}
	window.addEventListener('pointermove', onMove)
	window.addEventListener('pointerup', onUp)
	window.addEventListener('pointercancel', onCancel)
	window.addEventListener('contextmenu', onCancel)
	window.addEventListener('keydown', onKey)
	window.addEventListener('keyup', onKey)
	// Stops listening without ending or cancelling: what's left of a drag when its canvas goes away.
	return cleanup
}
