/** The last segment of a `/`-separated path. */
export const fileName = (path: string): string => path.slice(path.lastIndexOf('/') + 1)

/** Lowercase extension without the dot; `''` for none (a leading dot, as in `.gitignore`, isn't one). */
export function fileExtension(path: string): string {
	const name = fileName(path), dot = name.lastIndexOf('.')
	return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

/**
 * The name above a file card, as Obsidian shows it: a note without `.md` (plus ` › heading` when it's narrowed to a
 * subpath), any other file with its extension.
 */
export function fileLabel(path: string, subpath?: string): string {
	const name = fileName(path)
	if (fileExtension(path) !== 'md') return name
	const note = name.slice(0, -3)
	return subpath ? `${note} › ${subpath.slice(1)}` : note
}
