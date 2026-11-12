/**
 * Puts each word of text under `root` in a `jc-redacted` span, which the stylesheet draws as a bar in the text's
 * color: an image's privacy mode. Changes the DOM in place, so only for a copy that's thrown away.
 */
export function redactText(root: Element) {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
	const texts: Text[] = []
	for (let n = walker.nextNode(); n; n = walker.nextNode()) {
		if (n.textContent?.trim() && !n.parentElement?.closest('svg, style, script')) texts.push(n as Text)
	}
	for (const t of texts) {
		t.replaceWith(...t.textContent!.split(/(\s+)/).filter(Boolean).map((part) => {
			if (!part.trim()) return part
			const word = document.createElement('span')
			word.className = 'jc-redacted'
			word.textContent = part
			return word
		}))
	}
	// A broken image draws its `alt` text.
	for (const img of root.querySelectorAll('img[alt]')) img.setAttribute('alt', '')
}
