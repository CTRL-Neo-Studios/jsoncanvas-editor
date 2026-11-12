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

/** What a file card shows a file as, by its extension. */
export type FileKind = 'markdown' | 'image' | 'video' | 'audio' | 'pdf' | 'canvas' | 'other'

const KINDS: Record<string, FileKind> = {
	md: 'markdown',
	bmp: 'image', png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', svg: 'image', webp: 'image', avif: 'image',
	mp4: 'video', webm: 'video', ogv: 'video', mov: 'video', mkv: 'video',
	mp3: 'audio', wav: 'audio', m4a: 'audio', '3gp': 'audio', flac: 'audio', ogg: 'audio', oga: 'audio', opus: 'audio',
	pdf: 'pdf',
	canvas: 'canvas',
}

/** A file's kind by extension, grouped as Obsidian does. */
export const fileKind = (path: string): FileKind => KINDS[fileExtension(path)] ?? 'other'

const HEADING = /^ {0,3}(#{1,6})(?:[ \t]|$)/
const FENCE = /^ {0,3}(`{3,}|~{3,})/
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s/

/** Each line's heading level and lowercased text, skipping fenced code. */
function headings(lines: string[]): Array<{ level: number, text: string } | undefined> {
	let fence = ''
	return lines.map((line) => {
		const f = FENCE.exec(line)?.[1]
		if (fence) {
			if (f && f[0] === fence[0] && f.length >= fence.length && line.trim() === f) fence = ''
			return undefined
		}
		if (f) {
			fence = f
			return undefined
		}
		const h = HEADING.exec(line)
		// The text without an optional closing `###`.
		return h ? { level: h[1]!.length, text: line.slice(h[0].length).trim().replace(/(?:^|[ \t])#+$/, '').trim().toLowerCase() } : undefined
	})
}

function headingSection(lines: string[], path: string[]): string | undefined {
	const levels = headings(lines)
	let start = -1, end = lines.length
	for (const part of path) {
		const name = part.trim().toLowerCase()
		start = levels.findIndex((h, i) => i > start && i < end && h?.text === name)
		if (start < 0) return undefined
		const level = levels[start]!.level
		const next = levels.findIndex((h, i) => i > start && i < end && h !== undefined && h.level <= level)
		if (next >= 0) end = next
	}
	return lines.slice(start, end).join('\n')
}

// ponytail: blocks are runs of non-blank lines, so a fenced block with blank lines inside isn't one block.
function blockSection(lines: string[], id: string): string | undefined {
	const marker = `^${id}`
	const single = (line: string) => !line.trim() || LIST_ITEM.test(line) || HEADING.test(line)
	for (const [i, raw] of lines.entries()) {
		const line = raw.trimEnd()
		let end = i
		if (line.trim() === marker) {
			// An id on its own line names the block before it.
			end = i - 1
			while (end >= 0 && !lines[end]!.trim()) end--
			if (end < 0) continue
		}
		else if (!line.endsWith(` ${marker}`)) continue
		let start = end
		while (start > 0 && !single(lines[start]!) && !single(lines[start - 1]!)) start--
		const block = lines.slice(start, end + 1)
		if (end === i) block[block.length - 1] = line.slice(0, -marker.length).trimEnd()
		return block.join('\n')
	}
}

/**
 * What a file card narrowed to `subpath` shows of a note: a heading's section (`#Heading`, or a path such as
 * `#Parent#Child`) or a block (`#^id`), without the frontmatter. The whole text for an empty subpath or `#`;
 * `undefined` when there's no such heading or block.
 */
export function markdownSection(text: string, subpath: string): string | undefined {
	if (subpath === '' || subpath === '#') return text
	let lines = text.split(/\r?\n/)
	if (lines[0]?.trimEnd() === '---') {
		const end = lines.findIndex((l, i) => i > 0 && l.trimEnd() === '---')
		if (end > 0) lines = lines.slice(end + 1)
	}
	const path = subpath.slice(1)
	return path.startsWith('^') ? blockSection(lines, path.slice(1)) : headingSection(lines, path.split('#'))
}
