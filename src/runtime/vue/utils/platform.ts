export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)

/** The modifiers held during a drag or key press. */
export interface Modifiers {
	shiftKey: boolean
	altKey: boolean
	ctrlKey: boolean
	metaKey: boolean
}

/** Cmd on macOS, Ctrl elsewhere. */
export const isMod = (e: Modifiers): boolean => (IS_MAC ? e.metaKey : e.ctrlKey)
/** Held while dragging: drop copies instead of moving (Option on macOS, Ctrl elsewhere). */
export const isCloneKey = (e: Modifiers): boolean => (IS_MAC ? e.altKey : e.ctrlKey)
/** Held while dragging: don't snap (Ctrl on macOS, Alt elsewhere). */
export const isNoSnapKey = (e: Modifiers): boolean => (IS_MAC ? e.ctrlKey : e.altKey)
