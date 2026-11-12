import { isLightColor, isPresetColor, parseHexColor } from '../../core'

/** Classes and style that give an element a canvas color through `--jc-color`. */
export interface ColorBinding {
	class?: string
	style?: Record<string, string>
}

/** Presets whose default color (`--jc-color-N`) needs dark text on it; only yellow among Nuxt UI's 500 shades. */
const LIGHT_PRESETS: Record<string, true> = { 3: true }

export function colorBinding(color: unknown): ColorBinding {
	const c = typeof color === 'string' ? color.trim() : ''
	if (!c) return {}
	if (isPresetColor(c)) return { class: `jc-themed jc-color-${c}${LIGHT_PRESETS[c] ? ' jc-light' : ''}` }
	const rgb = parseHexColor(c)
	return { class: `jc-themed${rgb && isLightColor(rgb) ? ' jc-light' : ''}`, style: { '--jc-color': c } }
}
