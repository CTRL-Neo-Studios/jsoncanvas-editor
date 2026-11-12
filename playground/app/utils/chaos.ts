import type { JSONCanvas } from '@type32/jsoncanvas-editor/core'
import type { CanvasHost, NodeRendererProps } from '@type32/jsoncanvas-editor/vue'
import type { VNode } from 'vue'

const long = (n: number) => 'lorem ipsum dolor sit amet '.repeat(Math.ceil(n / 27)).slice(0, n)

/** A document where most things are wrong: what the editor must draw what it can of, edit, and save unchanged. */
export function chaosCanvas(): JSONCanvas {
	return {
		nodes: [
			null, 7, 'not a node', [],
			{ id: 'ok', type: 'text', text: '# Chaos\n\nEverything around this card is broken on purpose. Edit it: the rest must survive.', x: 0, y: 0, width: 400, height: 200 },
			{ id: 'script', type: 'text', text: '<script>window.__pwned = 1</script>\n\n<img src=x onerror="window.__pwned = 2">\n\n[a javascript link](javascript:window.__pwned=3) and ![an image](javascript:window.__pwned=4)', x: 450, y: 0, width: 400, height: 200 },
			{ id: 'mixed', type: 'text', text: 'RTL: שלום עולם · emoji: 🧪🔥👩🏽‍💻 · zero-width: a\u200Bb\u200Dc · control: \u0007\u001B · long word: ' + 'x'.repeat(400), x: 900, y: 0, width: 400, height: 200 },
			{ id: 'megabyte', type: 'text', text: `# A megabyte of text\n\n${long(1_000_000)}`, x: 0, y: 250, width: 400, height: 300 },
			{ id: 'js-link', type: 'link', url: 'javascript:window.__pwned=5', x: 450, y: 250, width: 400, height: 140 },
			{ id: 'data-link', type: 'link', url: 'data:text/html,<script>parent.__pwned=6</script>', x: 450, y: 410, width: 400, height: 140 },
			{ id: 'html-file', type: 'file', file: '<b onmouseover="window.__pwned=7">x</b>.md', x: 900, y: 250, width: 400, height: 300 },
			{ id: 'bg', type: 'group', label: '<i>a group</i> with a hostile background', background: 'x") ; background: red; ("', x: -50, y: 600, width: 500, height: 200 },
			{ id: 'boom', type: 'boom', x: 500, y: 600, width: 250, height: 120 },
			{ id: 'shape', type: 'shape', x: 800, y: 600, width: 250, height: 120 },
			{ id: 'huge', type: 'text', text: 'far away', x: 1e308, y: 0, width: 250, height: 60 },
			{ id: 'negative', type: 'text', text: 'inside out', x: 0, y: 0, width: -250, height: -60 },
			{ id: 'stringly', type: 'text', text: 'numbers as strings', x: '10', y: '10', width: '250', height: '60' },
			{ id: 'ok', type: 'text', text: 'a second card with the first one’s id', x: 1100, y: 600, width: 250, height: 120 },
		] as JSONCanvas['nodes'],
		edges: [
			null,
			{ id: 'to-nowhere', fromNode: 'ok', toNode: 'gone' },
			{ id: 'self', fromNode: 'script', fromSide: 'bottom', toNode: 'script', toSide: 'top', label: long(2000) },
			{ id: 'bad-sides', fromNode: 'ok', fromSide: 'middle', toNode: 'mixed', toSide: 7, color: '<script>' },
			{ id: 'to-shape', fromNode: 'mixed', toNode: 'shape', label: '<img src=x onerror="window.__pwned=8">' },
		] as JSONCanvas['edges'],
		'extra': { kept: true },
	}
}

const fail = (what: string) => {
	throw new Error(`The chaos host fails at ${what}`)
}

/** A host where every member throws, rejects, hangs or answers nonsense. */
export const chaosHost: CanvasHost = {
	resolveFile: path => (path.startsWith('<') ? fail('resolveFile') : (null as never)),
	readText: async () => 42 as never,
	pickFile: () => new Promise(() => {}), // never answers
	importFiles: async () => fail('importFiles'),
	filesIn: () => fail('filesIn'),
	listLinks: async () => ({ not: 'a list' }) as never,
	openFile: () => fail('openFile'),
	openLink: () => fail('openLink'),
	saveImage: async () => fail('saveImage'),
}

/** A custom card that can't be drawn. */
export const BoomCard = (_props: NodeRendererProps): VNode => {
	throw new Error('The boom card fails to draw, on purpose')
}
