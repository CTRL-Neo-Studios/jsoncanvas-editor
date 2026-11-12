import type { CanvasColor } from './types'

/** The spec's presets: red, orange, yellow, green, cyan, purple. Apps choose the actual colors. */
export const PRESET_COLORS = ['1', '2', '3', '4', '5', '6'] as const

export const isPresetColor = (color: CanvasColor): boolean => /^\d+$/.test(color)

const RGB_TRIPLE = /^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*$/
const hex2 = (n: number) => Math.min(255, n).toString(16).padStart(2, '0')

/** `"r, g, b"` (as some files have) becomes `#rrggbb`; anything else is returned as it is. */
export function normalizeColor(color: CanvasColor): CanvasColor {
	const m = RGB_TRIPLE.exec(color)
	return m ? `#${hex2(+m[1]!)}${hex2(+m[2]!)}${hex2(+m[3]!)}` : color
}

/** `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa` → `[r, g, b]` (alpha dropped). */
export function parseHexColor(color: string): [number, number, number] | undefined {
	const m = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.exec(color.trim())
	if (!m) return
	const h = m[1]!.length <= 4 ? [...m[1]!].map(c => c + c).join('') : m[1]!
	return [Number.parseInt(h.slice(0, 2), 16), Number.parseInt(h.slice(2, 4), 16), Number.parseInt(h.slice(4, 6), 16)]
}

/** Whether dark text reads better on this background (perceived brightness ≥ 150 of 255). */
export const isLightColor = ([r, g, b]: readonly [number, number, number]): boolean => (299 * r + 587 * g + 114 * b) / 1000 >= 150
