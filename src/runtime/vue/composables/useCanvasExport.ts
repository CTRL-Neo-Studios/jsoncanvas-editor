import { nextTick, shallowRef, type ShallowRef } from 'vue'
import { EXPORT_PADDING, exportSize, growBBox, pointBox, unionBBox, viewportBBox, type BBox } from '../../core'
import { captureElement } from '../utils/capture'
import { redactText } from '../utils/redact'
import type { CanvasContent } from './useCanvasContent'
import type { CanvasEditor } from './useCanvasEditor'

export interface ExportOptions {
	/** The whole canvas (default), or what the view shows. */
	frame?: 'full' | 'viewport'
	/**
	 * Image pixels per world unit, lowered if a side would pass `MAX_EXPORT_SIZE`. Defaults to the screen's pixel
	 * ratio, times the view's zoom for the viewport.
	 */
	scale?: number
	/** Text drawn as bars. */
	privacy?: boolean
	/** Around the cards, in world units (full canvas only). */
	padding?: number
	/** The `#watermark` slot at the bottom left; default `true`. */
	watermark?: boolean
}

/** What's being drawn for an export: the world box, and how. */
export interface ExportFrame {
	box: BBox
	privacy: boolean
	watermark: boolean
}

export interface CanvasExport {
	/** Set while an export renders its frame. */
	frame: ShallowRef<ExportFrame | undefined>
	/** The PNG; one export at a time. */
	exportPng: (options?: ExportOptions) => Promise<Blob>
	/** The box `options` frame, for the size of the image before exporting. */
	frameBox: (options?: ExportOptions) => BBox
}

/** How long cards get to load their files and Markdown before the image is taken anyway. */
const LOAD_TIMEOUT = 10_000
const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))

/**
 * Exports draw a second copy of the scene, off-screen at 100% with every card in the frame mounted and showing its
 * content, and capture it (`captureElement`).
 */
export function useCanvasExport(editor: CanvasEditor, content: CanvasContent, el: () => HTMLElement | null): CanvasExport {
	const frame = shallowRef<ExportFrame>()
	const { viewport } = editor

	function frameBox(o: ExportOptions = {}): BBox {
		if (o.frame === 'viewport') return viewportBBox(viewport.view, viewport.size.width, viewport.size.height)
		const cards = unionBBox(editor.scene.value.nodes.map(n => n.box)) ?? pointBox({ x: 0, y: 0 })
		return growBBox(cards, o.padding ?? EXPORT_PADDING)
	}

	/** Until cards have loaded what they show, and images and video have a picture. */
	async function loaded(root: HTMLElement) {
		const deadline = performance.now() + LOAD_TIMEOUT
		// Two frames with nothing in flight: a load that finished may start the next (a note, then its Markdown).
		do {
			await nextFrame()
			await nextFrame()
		} while (content.pending.value && performance.now() < deadline)
		await Promise.all([
			...[...root.querySelectorAll('img')].map(img => img.decode().catch(() => {})),
			...[...root.querySelectorAll('video')].map(v => v.readyState >= 2 || new Promise((resolve) => {
				v.addEventListener('loadeddata', resolve, { once: true })
				v.addEventListener('error', resolve, { once: true })
				setTimeout(resolve, Math.max(0, deadline - performance.now()))
			})),
		])
	}

	async function exportPng(o: ExportOptions = {}): Promise<Blob> {
		if (frame.value) throw new Error('An export is already running')
		const box = frameBox(o)
		const ratio = globalThis.devicePixelRatio || 1
		const size = exportSize(box, o.scale ?? (o.frame === 'viewport' ? viewport.scale.value * ratio : ratio))
		frame.value = { box, privacy: !!o.privacy, watermark: o.watermark ?? true }
		try {
			await nextTick()
			const root = el()
			if (!root) throw new Error('The canvas isn\'t mounted')
			await loaded(root)
			return await captureElement(root, {
				width: box.maxX - box.minX,
				height: box.maxY - box.minY,
				scale: size.scale,
				context: root.parentElement!,
				transform: o.privacy ? redactText : undefined,
			})
		}
		finally {
			frame.value = undefined
		}
	}

	return { frame, exportPng, frameBox }
}
