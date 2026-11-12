<script setup lang="ts">
// Performance scenarios, run in the page itself: `bun run bench`, then open /bench?run (all) or /bench?run=hub.
// Results show in a table and as `window.__bench` (JSON) for scripted runs.
import type { CanvasSide, JSONCanvas } from '@type32/jsoncanvas-editor/core'
import type { NodeRendererProps } from '@type32/jsoncanvas-editor/vue'
import { h } from 'vue'

/** The same pseudo-random numbers every run. */
function seeded() {
	let seed = 1
	return (n: number) => (seed = (seed * 48271) % 2147483647) % n
}

/** Any node with a box, custom types included. */
type Card = { id: string, type: string, x: number, y: number, width: number, height: number, [key: string]: unknown }

/** `count` cards in a grid (every 7th a file card), each linked to the next, plus `extra` random edges. */
function grid(count: number, extra = 0, card: (i: number, x: number, y: number) => Card = textCard): JSONCanvas & { nodes: Card[] } {
	const nodes: Card[] = [], edges: JSONCanvas['edges'] = []
	const cols = Math.ceil(Math.sqrt(count)), sides: CanvasSide[] = ['right', 'left']
	for (let i = 0; i < count; i++) {
		nodes.push(card(i, (i % cols) * 320, Math.floor(i / cols) * 200))
		if (i) edges.push({ id: `e${i}`, fromNode: `n${i - 1}`, fromSide: sides[0], toNode: `n${i}`, toSide: sides[1], ...(i % 10 === 0 && { label: `edge ${i}` }) })
	}
	const random = seeded()
	for (let i = 0; i < extra; i++) edges.push({ id: `x${i}`, fromNode: `n${random(count)}`, fromSide: 'bottom', toNode: `n${random(count)}`, toSide: 'top' })
	return { nodes, edges }
}
function textCard(i: number, x: number, y: number): Card {
	return i % 7 === 0
		? { id: `n${i}`, type: 'file', file: `Folder/Note ${i}.md`, x, y, width: 250, height: 120, color: String((i % 6) + 1) }
		: { id: `n${i}`, type: 'text', text: `Card ${i}\n\nSome **markdown** text.`, x, y, width: 250, height: 120 }
}
const LONG = Array.from({ length: 12 }, (_, i) => `## Section ${i}\n\nSome *Markdown* with a [[Welcome]] link, \`code\` and **bold** text, long enough to wrap.\n\n- a list item\n- another`).join('\n\n')

const scenarios: Record<string, () => JSONCanvas> = {
	'1k cards': () => grid(1000),
	'5k cards, 20k edges': () => grid(5000, 20000),
	'10k cards, 30k edges': () => grid(10000, 30000),
	// One card linked to 5,000 others: dragging it moves every edge.
	'hub 5k': () => {
		const c = grid(5000)
		c.edges = Array.from({ length: 4999 }, (_, i) => ({ id: `h${i}`, fromNode: 'n0', fromSide: 'right', toNode: `n${i + 1}`, toSide: 'left' }))
		return c
	},
	// 50 groups of 100 cards each.
	'groups 50 × 100': () => {
		const c = grid(5000)
		for (let g = 0; g < 50; g++) {
			const first = c.nodes![g * 100]!, last = c.nodes![g * 100 + 99]!
			c.nodes!.unshift({ id: `g${g}`, type: 'group', label: `Group ${g}`, x: first.x - 20, y: Math.min(first.y, last.y) - 20, width: 71 * 320, height: Math.abs(last.y - first.y) + 160 })
		}
		return c
	},
	'2k long text cards': () => grid(2000, 0, (i, x, y) => ({ id: `n${i}`, type: 'text', text: `# Card ${i}\n\n${LONG}`, x, y, width: 250, height: 120 })),
	'500 images': () => grid(500, 0, (i, x, y) => ({ id: `n${i}`, type: 'file', file: '29d4c6508c683ac70fef421fec786d48.jpg', x, y, width: 150, height: 200 })),
	'300 web pages': () => grid(300, 0, (i, x, y) => ({ id: `n${i}`, type: 'link', url: `${location.origin}/vault/Welcome.md?${i}`, x, y, width: 250, height: 160 })),
	'2k custom cards': () => grid(2000, 0, (i, x, y) => ({ id: `n${i}`, type: 'bench', value: i, x, y, width: 250, height: 120 })),
}

/** A custom card type, for `2k custom cards`. */
const BenchCard = (props: NodeRendererProps) =>
	h('div', { class: 'p-3 text-sm' }, [h('b', `Custom ${props.node.value}`), h('p', 'A card from nodeRenderers.')])

type Stats = { avg: number, p95: number, first?: number }
type Row = Record<string, number | string | Stats>

const host = createVaultHost()
const canvas = shallowRef<JSONCanvas>({ nodes: [], edges: [] })
const current = ref('')
const rows = ref<Array<{ name: string } & Row>>([])
const editor = useTemplateRef('editor')
const running = ref(false)

const frame = () => new Promise<number>(resolve => requestAnimationFrame(resolve))
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const round = (n: number) => Math.round(n * 10) / 10
function stats(t: number[]): Stats {
	const s = [...t].sort((a, b) => a - b)
	return { avg: round(t.reduce((a, b) => a + b, 0) / t.length), p95: round(s[Math.floor(s.length * 0.95)]!) }
}
/**
 * Frame times while `step(i)` runs once per frame. The first 5 frames (a pan's start: the world getting its own layer)
 * are reported apart, as `first` (the longest of them).
 */
async function frames(n: number, step: (i: number) => void): Promise<Stats> {
	const t: number[] = []
	await frame()
	let last = performance.now()
	for (let i = 0; i < n + 5; i++) {
		step(i)
		await frame()
		const now = performance.now()
		t.push(now - last)
		last = now
	}
	return { ...stats(t.slice(5)), first: round(Math.max(...t.slice(0, 5))) }
}
/** How long `action` takes until the frame after it (from the start of a frame, so 16.7 is "within one frame"). */
async function timed(action: () => void): Promise<number> {
	await frame()
	const t0 = performance.now()
	action()
	await frame()
	return round(performance.now() - t0)
}
const heap = () => round(((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0) / 2 ** 20)

async function measure(name: string): Promise<Row> {
	const doc = scenarios[name]!()
	const t0 = performance.now()
	current.value = name
	canvas.value = doc
	await nextTick()
	while (!editor.value) await frame()
	await frame()
	await frame()
	const row: Row = { load: round(performance.now() - t0) }
	const jc = editor.value, root = document.querySelector<HTMLElement>('.jc-canvas')!
	const r = root.getBoundingClientRect(), cx = r.x + r.width / 2, cy = r.y + r.height / 2
	await sleep(1500) // files and Markdown load
	const wheel = (i: number) => root.dispatchEvent(new WheelEvent('wheel', { deltaX: i % 2 ? 14 : -10, deltaY: 9, clientX: cx, clientY: cy, bubbles: true, cancelable: true }))
	row.zoom = round(jc.viewport.zoom)
	row.dom = document.querySelectorAll('.jc-canvas *').length
	row.panFit = await frames(60, wheel)
	jc.setViewport({ x: 1000, y: 600, zoom: 0 })
	await sleep(500)
	row.dom100 = document.querySelectorAll('.jc-canvas *').length
	row.pan100 = await frames(60, wheel)

	// One edit (a nudge) and its undo, at 100 %.
	const card = document.querySelector<HTMLElement>('.jc-world .jc-node')!
	jc.select([card.dataset.key!])
	root.focus()
	await frame()
	const nudges: number[] = []
	for (let i = 0; i < 5; i++) nudges.push(await timed(() => root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))))
	row.edit = stats(nudges).avg
	await sleep(300)
	row.undo = await timed(() => jc.undo())

	// Drag one card (the first: the hub in `hub 5k`), then every card.
	const drag = async (target: Element) => {
		const b = target.getBoundingClientRect(), x = b.x + 10, y = b.y + 10
		target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1, button: 0, clientX: x, clientY: y }))
		const move = await frames(30, i => window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: x + 10 + i * 3, clientY: y + i * 2 })))
		const drop = await timed(() => window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: x + 100, clientY: y + 60 })))
		return { move, drop }
	}
	const firstNode = doc.nodes![0] as Card, first = firstNode.id
	jc.setViewport({ x: firstNode.x + 125, y: firstNode.y + 60, zoom: 0 })
	await sleep(300)
	jc.select([first])
	await frame()
	/** Where the last card is now: a drag of everything moves it too. */
	const lastX = () => (jc.canvas.nodes!.at(-1) as Card).x
	row.drag1 = (await drag(document.querySelector(`.jc-world [data-key="${first}"] .jc-node-container`)!)).move
	row.moved1 = (jc.canvas.nodes!.find(n => n.id === first) as Card).x - firstNode.x
	row.selectAll = await timed(() => root.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', metaKey: true, ctrlKey: true, bubbles: true, cancelable: true })))
	row.selected = jc.selected.size
	const before = lastX()
	const all = await drag(document.querySelector(`.jc-world [data-key="${first}"] .jc-node-container`)!)
	row.dragAll = all.move
	row.dropAll = all.drop
	row.movedAll = lastX() - before
	jc.select([])
	row.heapMB = heap()
	return row
}

async function run(only?: string) {
	running.value = true
	rows.value = []
	for (const name of Object.keys(scenarios)) {
		if (only && !name.includes(only)) continue
		rows.value.push({ name, ...await measure(name) })
		Object.assign(window, { __bench: rows.value })
		canvas.value = { nodes: [], edges: [] }
		current.value = ''
		await sleep(500)
	}
	running.value = false
	Object.assign(window, { __benchDone: true })
}

const route = useRoute()
onMounted(() => {
	if (route.query.run !== undefined) void run(String(route.query.run) || undefined)
})

const columns = ['load', 'zoom', 'dom', 'panFit', 'dom100', 'pan100', 'edit', 'undo', 'drag1', 'moved1', 'selectAll', 'selected', 'dragAll', 'dropAll', 'movedAll', 'heapMB']
const show = (v: unknown) => {
	if (!v || typeof v !== 'object') return String(v ?? '')
	const s = v as Stats
	return `${s.avg} / ${s.p95}${s.first === undefined ? '' : ` (${s.first})`}`
}
</script>

<template>
	<div class="h-dvh flex flex-col">
		<div class="flex items-center gap-3 p-2 border-b border-default text-sm">
			<UButton size="sm" :loading="running" label="Run all" @click="run()" />
			<span class="text-muted">{{ current ? `Running ${current}…` : 'Times in ms (frames: avg / p95); dom: elements in the canvas' }}</span>
		</div>
		<div class="overflow-auto max-h-80 text-xs">
			<table class="w-full tabular-nums">
				<thead>
					<tr>
						<th class="text-left p-1">
							scenario
						</th>
						<th v-for="c in columns" :key="c" class="text-right p-1">
							{{ c }}
						</th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="row in rows" :key="row.name">
						<td class="p-1">
							{{ row.name }}
						</td>
						<td v-for="c in columns" :key="c" class="text-right p-1">
							{{ show(row[c]) }}
						</td>
					</tr>
				</tbody>
			</table>
		</div>
		<div class="flex-1 min-h-0">
			<JsonCanvas
				v-if="current"
				:key="current"
				ref="editor"
				v-model="canvas"
				:host="host"
				:node-renderers="{ bench: BenchCard }"
			/>
		</div>
	</div>
</template>
