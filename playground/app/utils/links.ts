import { fileName } from '@type32/jsoncanvas-editor/core'
import type { CanvasLink } from '@type32/jsoncanvas-editor/vue'

/** `[[target#subpath|alias]]`, but not `![[embeds]]`. */
const wikiLink = /(?<!!)\[\[([^\]|#]*)(#[^\]|]*)?(?:\|[^\]]*)?\]\]/g

/** The path a link target points to, Obsidian-style: the exact path, the path plus `.md`, else the shortest path with that file name. */
export function resolveTarget(target: string, paths: readonly string[]): string | undefined {
	if (paths.includes(target)) return target
	if (paths.includes(`${target}.md`)) return `${target}.md`
	const name = fileName(target)
	return paths.filter(p => [name, `${name}.md`].includes(fileName(p))).sort((a, b) => a.length - b.length)[0]
}

/** The places the note at `from` (with `text`) links to, among `paths`; `[[#heading]]` stays in the note. */
export function noteLinks(text: string, from: string, paths: readonly string[]): CanvasLink[] {
	const links = new Map<string, CanvasLink>()
	for (const [, target = '', subpath] of text.matchAll(wikiLink)) {
		const file = target.trim() ? resolveTarget(target.trim(), paths) : from
		if (file) links.set(file + (subpath ?? ''), subpath ? { file, subpath } : { file })
	}
	return [...links.values()]
}

/** Saves `blob` as a download named `name`. */
export function download(blob: Blob, name: string) {
	const a = document.createElement('a')
	a.href = URL.createObjectURL(blob)
	a.download = name
	a.click()
	setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
