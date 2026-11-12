<script setup lang="ts">
// Files come from `test/fixtures/vault`, served at `/vault/<path>`; to browse your own vault instead:
// `JC_VAULT=/path/to/vault bun run dev`.
import { parseCanvas, type CanvasSide, type JSONCanvas, type Viewport } from '@type32/jsoncanvas-editor/core'
import BaseCard from '~/components/BaseCard.vue'
import demo from '../../../test/fixtures/obsidian-demo.canvas?raw'
import sample from '../../../test/fixtures/spec-sample.canvas?raw'

/** `count` cards in a grid (every 7th a group around its neighbours' row), each linked to the next. */
function stress(count: number): JSONCanvas {
	const nodes: JSONCanvas['nodes'] = [], edges: JSONCanvas['edges'] = []
	const cols = Math.ceil(Math.sqrt(count)), sides: CanvasSide[] = ['right', 'left']
	for (let i = 0; i < count; i++) {
		const x = (i % cols) * 320, y = Math.floor(i / cols) * 200
		nodes.push(i % 7 === 0
			? { id: `n${i}`, type: 'file', file: `Folder/Note ${i}.md`, x, y, width: 250, height: 120, color: String((i % 6) + 1) }
			: { id: `n${i}`, type: 'text', text: `Card ${i}\n\nSome **markdown** text.`, x, y, width: 250, height: 120 })
		if (i) edges.push({ id: `e${i}`, fromNode: `n${i - 1}`, fromSide: sides[0], toNode: `n${i}`, toSide: sides[1], label: i % 10 === 0 ? `edge ${i}` : undefined })
	}
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
}
const route = useRoute()
const choice = ref(String(route.query.canvas ?? 'Obsidian demo'))
const canvas = shallowRef(canvases[choice.value]!())
watch(choice, (c) => {
	canvas.value = canvases[c]!()
})
const viewport = ref<Viewport>()

const host = createVaultHost()
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
			<span class="text-muted tabular-nums">
				{{ viewport ? `x ${viewport.x.toFixed(0)} · y ${viewport.y.toFixed(0)} · zoom ${viewport.zoom.toFixed(2)}` : '' }}
			</span>
			<UButton size="sm" variant="outline" label="Zoom to fit" @click="editor?.zoomToFit()" />
			<UButton
				size="sm"
				variant="outline"
				label="Add sticky"
				@click="editor?.addNode({ type: 'sticky', note: 'New sticky', ...editor.screenToWorld({ clientX: 400, clientY: 300 }), width: 250, height: 160 })"
			/>
			<span class="text-muted">{{ editor?.issues.length ? `${editor.issues.length} issue(s)` : '' }}</span>
		</div>
		<div class="flex-1 min-h-0">
			<JsonCanvas :key="choice" ref="editor" v-model="canvas" v-model:viewport="viewport" :host="host" :file-renderers="{ base: BaseCard }">
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
			</JsonCanvas>
		</div>
	</div>
</template>
