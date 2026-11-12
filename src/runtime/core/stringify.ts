import type { JSONCanvas } from './types'

/**
 * Writes a canvas as Obsidian does, so files edited in both diff cleanly: tab-indented, and any object or array
 * whose values are all plain (no objects or arrays) on one line with no spaces, so each node and edge is one line.
 * No trailing newline.
 */
export function stringifyCanvas(canvas: JSONCanvas): string {
	return lines(canvas).join('\n')
}

// `null` counts as an object here (as in Obsidian), so an array holding one isn't put on one line.
const isPlain = (v: unknown) => typeof v !== 'object'

function lines(value: unknown): string[] {
	if (value === undefined) return ['null']
	if (isPlain(value) || value === null || value instanceof Date) return [JSON.stringify(value)]
	if (Array.isArray(value)) return value.every(isPlain) ? [JSON.stringify(value)] : block('[', ']', value.map(lines))
	const object = value as Record<string, unknown>
	if (Object.values(object).every(isPlain)) return [JSON.stringify(object)]
	const entries = Object.keys(object).filter(k => object[k] !== undefined).map((key) => {
		const l = lines(object[key])
		l[0] = `${JSON.stringify(key)}:${l[0]}`
		return l
	})
	return block('{', '}', entries)
}

function block(open: string, close: string, items: string[][]): string[] {
	const out = [open]
	for (const [i, item] of items.entries()) {
		for (const [j, line] of item.entries()) out.push(`\t${line}${j === item.length - 1 && i < items.length - 1 ? ',' : ''}`)
	}
	out.push(close)
	return out
}
