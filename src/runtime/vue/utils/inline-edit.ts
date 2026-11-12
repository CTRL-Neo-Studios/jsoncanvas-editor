/**
 * Starts editing `text` in the contenteditable `el`: fills it once (so Vue never rewrites what's typed), focuses it,
 * and puts the caret at `at` (client px, where it was clicked) or selects everything.
 */
export function startInlineEdit(el: HTMLElement, text: string, at?: { x: number, y: number }): void {
	el.textContent = text
	el.focus()
	const selection = getSelection()
	const caret = at && document.caretPositionFromPoint?.(at.x, at.y)
	if (caret && el.contains(caret.offsetNode)) selection?.collapse(caret.offsetNode, caret.offset)
	else selection?.selectAllChildren(el)
}

/** Ends an inline edit by handing focus back to the canvas (which blurs, and so commits, the editor). */
export function focusCanvas(from: Element): void {
	from.closest<HTMLElement>('.jc-canvas')?.focus({ preventScroll: true })
}
