<script setup lang="ts">
// Files come from `test/fixtures/vault`, served at `/vault/<path>`; to browse your own vault instead:
// `JC_VAULT=/path/to/vault bun run dev`, or Open folder (Chromium), which also saves canvases back to it.
import { parseCanvas, stringifyCanvas, type CanvasSide, type JSONCanvas, type Viewport } from '@type32/jsoncanvas-editor/core'
import type { CanvasError } from '@type32/jsoncanvas-editor/vue'
import BaseCard from '~/components/BaseCard.vue'
import demo from '../../../test/fixtures/obsidian-demo.canvas?raw'
import sample from '../../../test/fixtures/spec-sample.canvas?raw'

/**
 * `count` cards in a grid (every 7th a file card), each linked to the next, plus `extra` edges between random pairs
 * (the same ones every time).
 */
function stress(count: number, extra = 0): JSONCanvas {
	const nodes: JSONCanvas['nodes'] = [], edges: JSONCanvas['edges'] = []
	const cols = Math.ceil(Math.sqrt(count)), sides: CanvasSide[] = ['right', 'left']
	for (let i = 0; i < count; i++) {
		const x = (i % cols) * 320, y = Math.floor(i / cols) * 200
		nodes.push(i % 7 === 0
			? { id: `n${i}`, type: 'file', file: `Folder/Note ${i}.md`, x, y, width: 250, height: 120, color: String((i % 6) + 1) }
			: { id: `n${i}`, type: 'text', text: `Card ${i}\n\nSome **markdown** text.`, x, y, width: 250, height: 120 })
		if (i) edges.push({ id: `e${i}`, fromNode: `n${i - 1}`, fromSide: sides[0], toNode: `n${i}`, toSide: sides[1], label: i % 10 === 0 ? `edge ${i}` : undefined })
	}
	let seed = 1
	const random = (n: number) => (seed = (seed * 48271) % 2147483647) % n
	for (let i = 0; i < extra; i++) edges.push({ id: `x${i}`, fromNode: `n${random(count)}`, fromSide: 'bottom', toNode: `n${random(count)}`, toSide: 'top' })
	return { nodes, edges }
}

const unsupported: JSONCanvas = {
	nodes: [
		{ id: 'a', type: 'text', text: 'A supported card', x: 0, y: 0, width: 250, height: 60 },
		{ id: 'b', type: 'shape', shape: 'star', x: 400, y: 0, width: 200, height: 120 },
		{ id: 'g', type: 'group', label: 'Yellow group', color: '3', x: -40, y: -80, width: 700, height: 260 },
	],
	edges: [
		{ id: 'e1', fromNode: 'a', toNode: 'b', label: 'to an unknown node', color: '#0080ff' },
		{ id: 'e2', fromNode: 'a', toNode: 'gone' },
	],
}

/** One card of each kind the vault has, plus a missing file, links and a group with a background. */
const everyKind: JSONCanvas = {
	nodes: [
		{ id: 'group', type: 'group', label: 'Ratio background', background: 'Pasted image 20261111150745.png', backgroundStyle: 'ratio', x: 440, y: 1440, width: 840, height: 440 },
		{ id: 'grouped', type: 'text', text: 'A card in a group', x: 480, y: 1500, width: 250, height: 60 },
		{ id: 'text', type: 'text', text: '# Every kind\n\nA text card linking to [[Welcome]] and [[Random Rambling#Some heading]].', x: 0, y: 0, width: 400, height: 160 },
		{ id: 'note', type: 'file', file: 'Welcome.md', x: 440, y: 0, width: 400, height: 400 },
		{ id: 'section', type: 'file', file: 'Welcome.md', subpath: '#Some heading', x: 880, y: 0, width: 400, height: 400 },
		{ id: 'image', type: 'file', file: '29d4c6508c683ac70fef421fec786d48.jpg', x: 1320, y: 0, width: 400, height: 400 },
		{ id: 'video', type: 'file', file: 'clip.mp4', x: 0, y: 480, width: 400, height: 400 },
		{ id: 'pdf', type: 'file', file: 'doc.pdf', subpath: '#page=2', x: 440, y: 480, width: 400, height: 400 },
		{ id: 'canvas', type: 'file', file: 'Untitled.canvas', x: 880, y: 480, width: 400, height: 400 },
		{ id: 'base', type: 'file', file: 'Untitled.base', x: 1320, y: 480, width: 400, height: 400 },
		{ id: 'audio', type: 'file', file: 'tone.wav', x: 0, y: 960, width: 400, height: 60 },
		{ id: 'other', type: 'file', file: 'data.zip', x: 440, y: 960, width: 400, height: 400 },
		{ id: 'missing', type: 'file', file: 'Missing note.md', x: 880, y: 960, width: 400, height: 400 },
		{ id: 'youtube', type: 'link', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', x: 1320, y: 960, width: 400, height: 400 },
		{ id: 'web', type: 'link', url: 'https://example.com', x: 0, y: 1440, width: 400, height: 400 },
		// Not a spec type: drawn by the page's `#node-sticky` slot.
		{ id: 'sticky', type: 'sticky', note: 'A custom card. Double-click to edit.', x: 1320, y: 1440, width: 250, height: 160, color: '3' },
	],
	edges: [],
}

const canvases: Record<string, () => JSONCanvas> = {
	'Every kind': () => everyKind,
	'Obsidian demo': () => parseCanvas(demo).canvas,
	'Spec sample': () => parseCanvas(sample).canvas,
	'Unsupported data': () => unsupported,
	'1,000 nodes': () => stress(1000),
	// `?canvas=Stress&nodes=5000&edges=20000`
	'Stress': () => stress(Number(useRoute().query.nodes) || 5000, Number(useRoute().query.edges) || 0),
	// Broken on purpose, with a host that fails at everything and a card that can't be drawn.
	'Chaos': chaosCanvas,
}
const route = useRoute()
const toast = useToast()
const choice = ref(String(route.query.canvas ?? 'Obsidian demo'))
const canvas = shallowRef(canvases[choice.value]!())
watch(choice, (c) => {
	folder.value = undefined
	canvas.value = canvases[c]!()
})
const viewport = ref<Viewport>()

// A local folder: its canvases are read from and saved back to it.
const folder = shallowRef<CanvasFolder>()
/** The folder's canvas chosen, and the one shown (once read). */
const folderCanvas = ref<string>()
const shownPath = ref<string>()
const folderCanvases = computed(() => folder.value?.paths.value.filter(p => p.endsWith('.canvas')) ?? [])
async function openFolder() {
	const opened = await openCanvasFolder(path => (folderCanvas.value = path))
	if (!opened) return
	folder.value = opened
	shownPath.value = folderCanvas.value = undefined
	folderCanvas.value = folderCanvases.value[0]
	if (!folderCanvas.value) toast.add({ title: `No canvas in “${opened.name}”` })
}
/** The document as read from the folder, so it isn't written straight back. */
let read: JSONCanvas | undefined
// `sync`: a folder opened again shows its first canvas again, though the choice ends where it was.
watch(folderCanvas, async (path) => {
	if (!path || !folder.value) return
	try {
		canvas.value = read = parseCanvas(await folder.value.read(path)).canvas
		shownPath.value = path
	}
	catch (e) {
		toast.add({ title: `Can't open ${path}`, description: String(e), color: 'error' })
	}
}, { flush: 'sync' })
let saving = 0
watch(canvas, (doc) => {
	const f = folder.value, path = shownPath.value
	if (!f || !path || doc === read) return
	clearTimeout(saving)
	saving = window.setTimeout(() => void f.write(path, stringifyCanvas(doc)), 500)
})
/** What's shown, so the editor starts afresh (and fitted) for each canvas. */
const source = computed(() => (folder.value && shownPath.value ? `${folder.value.name}/${shownPath.value}` : choice.value))
watch(source, () => (viewport.value = undefined))

const vaultHost = createVaultHost()
const host = computed(() => folder.value?.host ?? (choice.value === 'Chaos' ? chaosHost : vaultHost))
/** Host failures, one toast per kind. */
function onError(e: CanvasError) {
	toast.add({ id: e.action, title: `host.${e.action} failed`, description: String(e.error), color: 'warning' })
}
/** The sticky card (drawn by the `#node-sticky` slot below), offered in the bottom bar and the add menus. */
const cardTemplates = [{ label: 'Add sticky', icon: 'i-lucide-notebook-pen', node: { type: 'sticky', note: 'New sticky', color: '3', width: 250, height: 160 } }]
const editor = useTemplateRef('editor')

// For scripted checks (screenshots, frame timing).
onMounted(() => {
	Object.assign(window, { __jc: editor })
})
</script>

<template>
	<div class="h-dvh flex flex-col">
		<div class="flex items-center gap-3 p-2 border-b border-default text-sm">
			<USelect v-model="choice" :items="Object.keys(canvases)" class="w-48" />
			<UButton size="sm" variant="outline" icon="i-lucide-folder-open" label="Open folder…" @click="openFolder" />
			<USelect v-if="folder" v-model="folderCanvas" :items="folderCanvases" :placeholder="folder.name" class="w-64" />
			<span class="text-muted tabular-nums">
				{{ viewport ? `x ${viewport.x.toFixed(0)} · y ${viewport.y.toFixed(0)} · zoom ${viewport.zoom.toFixed(2)}` : '' }}
			</span>
			<UButton size="sm" variant="outline" label="Zoom to fit" @click="editor?.zoomToFit()" />
			<span class="text-muted">{{ editor?.issues.length ? `${editor.issues.length} issue(s)` : '' }}</span>
		</div>
		<div class="flex-1 min-h-0">
			<JsonCanvas
				:key="source"
				ref="editor"
				v-model="canvas"
				v-model:viewport="viewport"
				:host="host"
				:file-renderers="{ base: BaseCard }"
				:node-renderers="{ boom: BoomCard }"
				:card-templates="cardTemplates"
				@error="onError"
			>
				<!-- A card for a node type of our own: shows `note`, edits it on double-click. -->
				<template #node-sticky="{ node, editing, update, done }">
					<textarea
						v-if="editing"
						class="size-full p-3 bg-transparent resize-none outline-none"
						:value="String(node.note ?? '')"
						@vue:mounted="({ el }: { el: HTMLTextAreaElement }) => el.focus()"
						@change="update({ note: ($event.target as HTMLTextAreaElement).value })"
						@keydown.escape="done()"
					/>
					<div v-else class="size-full p-3 font-medium whitespace-pre-wrap">
						{{ node.note }}
					</div>
				</template>
				<!-- Drawn at the bottom left of exported images. -->
				<template #watermark>
					<span class="flex items-center gap-2 text-4xl font-bold text-muted">
						<UIcon name="i-lucide-layout-dashboard" />
						JSON Canvas
					</span>
				</template>
			</JsonCanvas>
		</div>
	</div>
</template>
