import { shallowRef, type InjectionKey, type ShallowRef, type VNode } from 'vue'
import type { JSONCanvas, JSONCanvasTextNode } from '../../core'
import type { CanvasHost, FileRenderers, NodeRendererProps, NodeRenderers, ResolvedFile } from '../host'
import type { CanvasMessages } from '../messages'
import type { CanvasActions, CanvasSettings, CardTemplate } from './useCanvasActions'
import type { CanvasEditor } from './useCanvasEditor'
import type { CanvasInteraction } from './useCanvasInteraction'

/** Slots that replace how cards are shown (whole cards by node type, a text card's display and editor) and the chrome. */
export interface CanvasSlots {
	/** A card for nodes of `type` (`#node-shape`, `#node-file`, ...); takes precedence over `nodeRenderers`. */
	[slot: `node-${string}`]: ((props: NodeRendererProps) => VNode[]) | undefined
	'text-display'?: (props: { node: JSONCanvasTextNode, text: string }) => VNode[]
	/** `update` reports the text as it's typed; `done` ends editing (the last `update` is saved). */
	'text-editor'?: (props: { node: JSONCanvasTextNode, text: string, update: (text: string) => void, done: () => void }) => VNode[]
	/** Replaces the floating toolbar above the selection. */
	'toolbar'?: (props: { actions: CanvasActions }) => VNode[]
	/** Replaces the controls at the right (settings, zoom, undo, help). */
	'controls'?: (props: { settings: CanvasSettings, actions: CanvasActions, openHelp: () => void }) => VNode[]
	/** Replaces the bar of cards to add at the bottom. */
	'card-bar'?: (props: { actions: CanvasActions, templates: readonly CardTemplate[] }) => VNode[]
	/** Replaces the hint shown on an empty canvas. */
	'empty'?: () => VNode[]
}

/** What cards need from the canvas around them (provided by `<JsonCanvas>`). */
export interface CanvasContent {
	host: () => CanvasHost | undefined
	fileRenderers: () => FileRenderers | undefined
	nodeRenderers: () => NodeRenderers | undefined
	slots: CanvasSlots
	readonly: () => boolean
	messages: () => CanvasMessages
	interaction: CanvasInteraction
	/** The host's answer for `path`, cached until `refreshFiles`. Without `resolveFile`, every file exists. */
	resolveFile: (path: string) => Promise<ResolvedFile>
	/** Cached until `refreshFiles`; rejects without `readText`. */
	readText: (path: string) => Promise<string>
	/** Forgets cached files (all, or those at `paths`), so cards showing them load them again. */
	refreshFiles: (paths?: string[]) => void
	/** Bumped by `refreshFiles`; cards watch it to load again. */
	fileVersion: ShallowRef<number>
	/** A card's media is `ratio` wide per unit of height: the card takes and keeps that shape (0: no shape to keep). */
	setAspect: (key: string, ratio: number) => void
	/** A card's content needs exactly this height (an audio player). */
	setHeight: (key: string, height: number) => void
}

export const CANVAS_CONTENT: InjectionKey<CanvasContent> = Symbol('jc-content')

export interface CanvasContentOptions {
	host: () => CanvasHost | undefined
	fileRenderers: () => FileRenderers | undefined
	nodeRenderers: () => NodeRenderers | undefined
	slots: CanvasSlots
	readonly: () => boolean
	messages: () => CanvasMessages
}

export function useCanvasContent(editor: CanvasEditor, interaction: CanvasInteraction, o: CanvasContentOptions): CanvasContent {
	const files = new Map<string, Promise<ResolvedFile>>()
	const texts = new Map<string, Promise<string>>()
	const fileVersion = shallowRef(0)

	/** `load(path)` once per path; a failure isn't kept, so the next card tries again. */
	function cached<T>(cache: Map<string, Promise<T>>, path: string, load: () => T | Promise<T>): Promise<T> {
		let p = cache.get(path)
		if (!p) {
			p = Promise.resolve().then(load)
			p.catch(() => cache.delete(path))
			cache.set(path, p)
		}
		return p
	}

	/** The node at `key` resized by `change`, without an undo step; never in a read-only canvas. */
	function amendSize(key: string, change: (size: { width: number, height: number }) => { width: number, height: number }) {
		if (o.readonly()) return
		editor.amend((doc: JSONCanvas) => {
			const item = editor.scene.value.byKey.get(key)
			const i = item ? doc.nodes!.indexOf(item.node) : -1
			if (i < 0) return doc
			const node = doc.nodes![i] as { width: number, height: number }
			const size = change(node)
			if (size.width === node.width && size.height === node.height) return doc
			const nodes = doc.nodes!.slice()
			nodes[i] = { ...nodes[i]!, ...size }
			return { ...doc, nodes }
		})
	}

	return {
		host: o.host,
		fileRenderers: o.fileRenderers,
		nodeRenderers: o.nodeRenderers,
		slots: o.slots,
		readonly: o.readonly,
		messages: o.messages,
		interaction,
		fileVersion,
		resolveFile: path => cached(files, path, () => o.host()?.resolveFile?.(path) ?? { exists: true }),
		readText: path => cached(texts, path, () => {
			const read = o.host()?.readText
			if (!read) throw new Error('The host can\'t read files')
			return read(path)
		}),
		refreshFiles(paths) {
			for (const cache of [files, texts]) {
				if (!paths) cache.clear()
				else for (const p of paths) cache.delete(p)
			}
			fileVersion.value++
		},
		setAspect(key, ratio) {
			if (!(ratio > 0) || !Number.isFinite(ratio)) return void editor.aspects.delete(key)
			editor.aspects.set(key, ratio)
			// Shrinks to fit inside the current box, as Obsidian does.
			amendSize(key, ({ width: w, height: h }) => ({ width: Math.round(Math.min(w, h * ratio)), height: Math.round(Math.min(h, w / ratio)) }))
		},
		setHeight(key, height) {
			amendSize(key, ({ width }) => ({ width, height: Math.round(height) }))
		},
	}
}
