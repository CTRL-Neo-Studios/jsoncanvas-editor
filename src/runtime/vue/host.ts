import type { Component } from 'vue'
import type { FileKind, JSONCanvasFileNode, JSONCanvasNode, JSONCanvasUnsupportedNode } from '../core'

/** A place a note links to: a file, and optionally a heading or block in it (`#Heading`, `#^block`). */
export interface CanvasLink {
	file: string
	subpath?: string
}

/** What the host knows of a file a card shows. */
export interface ResolvedFile {
	exists: boolean
	/** Shown on generic cards; defaults to the path's last segment. */
	name?: string
	/** Lowercase extension without the dot; defaults to the path's. */
	ext?: string
	/** Where the browser can load it from (images, video, audio, PDFs, link `src`s). */
	url?: string
}

/** What the canvas asks of the app around it. All optional: what the host leaves out, the canvas doesn't offer. */
export interface CanvasHost {
	/** Whether a card's file exists, and where to load it from. Without it every file counts as existing, with no URL. */
	resolveFile?: (path: string) => ResolvedFile | Promise<ResolvedFile>
	/** A text file's contents: notes and canvases shown in cards. */
	readText?: (path: string) => string | Promise<string>
	/** Saves a note's new text. With it, note cards are edited in place (double-click, or Edit in the toolbar). */
	writeText?: (path: string, text: string) => void | Promise<void>
	/** Lets the user choose a file (of `kinds`, if given); resolves to its path, or `undefined` when cancelled. */
	pickFile?: (options?: { kinds?: FileKind[] }) => Promise<string | undefined>
	/** Stores files dropped or pasted onto the canvas; resolves to their paths. */
	importFiles?: (files: File[]) => Promise<string[]>
	/**
	 * Paths of the app's own files a drop or paste carries in the app's own format (rows dragged from its file tree);
	 * `undefined` when it carries none. Called during the event, so `data` must be read before any `await`.
	 */
	filesIn?: (data: DataTransfer) => string[] | Promise<string[]> | undefined
	/** Saves an image exported from the canvas (a PNG); without it, the chrome offers no export. */
	saveImage?: (png: Blob) => void | Promise<void>
	/** The places the note at `path` links to. */
	listLinks?: (path: string) => CanvasLink[] | Promise<CanvasLink[]>
	/** Opens a file outside the canvas (`newTab` with Mod held). */
	openFile?: (path: string, subpath: string | undefined, newTab: boolean) => void
	/** Follows a wiki-link (`[[target]]`) from a card. */
	openLink?: (target: string) => void
	/** Opens a web address outside the app; without it, `window.open(url, '_blank')`. */
	openUrl?: (url: string) => void
}

/** A host call that failed (threw, rejected, or answered with the wrong type); the canvas carried on without it. */
export interface CanvasError {
	action: keyof CanvasHost
	error: unknown
}

/** Props of a component in `fileRenderers`. */
export interface FileRendererProps {
	node: JSONCanvasFileNode
	file: ResolvedFile
	host?: CanvasHost
}

/** Components that draw file cards, by lowercase extension (`base`, `md`, ...); they replace the built-in ones. */
export type FileRenderers = Record<string, Component<FileRendererProps>>

/** Props of a card from `nodeRenderers` or a `#node-<type>` slot. */
export interface NodeRendererProps<N = JSONCanvasNode | JSONCanvasUnsupportedNode> {
	node: N
	selected: boolean
	/** The only thing selected: the card's content takes the pointer (clicks, scrolling). */
	focused: boolean
	/** Double-clicked into: show an editor, and call `done` when finished. */
	editing: boolean
	/** Zoomed far out: a cheap placeholder is enough. */
	contentHidden: boolean
	readonly: boolean
	host?: CanvasHost
	/** Saves changes to the node (one undo step); a key set to `undefined` is removed. Ignored when read-only. */
	update: (patch: Record<string, unknown>) => void
	/** Ends editing. */
	done: () => void
}

/**
 * Cards by node `type`. A spec type (`text`, `file`, `link`, `group`) replaces the built-in card; any other adds
 * one, and nodes of that type are no longer reported as unsupported.
 */
export type NodeRenderers = Record<string, Component<NodeRendererProps>>
