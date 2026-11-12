/** A place a note links to: a file, and optionally a heading or block in it (`#Heading`, `#^block`). */
export interface CanvasLink {
	file: string
	subpath?: string
}

/** What the canvas asks of the app around it. All optional: what the host leaves out, the canvas doesn't offer. */
export interface CanvasHost {
	/** Lets the user choose a file; resolves to its path, or `undefined` when cancelled. */
	pickFile?: () => Promise<string | undefined>
	/** The places the note at `path` links to. */
	listLinks?: (path: string) => CanvasLink[] | Promise<CanvasLink[]>
}
