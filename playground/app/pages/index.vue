<script setup lang="ts">
import { parseCanvas, type CanvasSide, type JSONCanvas, type Viewport } from '@type32/jsoncanvas-editor/core'
import type { CanvasHost } from '@type32/jsoncanvas-editor/vue'
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

const canvases: Record<string, () => JSONCanvas> = {
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

/** Stands in for an app: the file picker asks for a path, and every note links to the same two places. */
const host: CanvasHost = {
	pickFile: async () => prompt('File path') || undefined,
	listLinks: () => [{ file: 'Linked note.md' }, { file: 'Linked note.md', subpath: '#Heading' }],
}
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
			<span class="text-muted">{{ editor?.issues.length ? `${editor.issues.length} issue(s)` : '' }}</span>
		</div>
		<div class="flex-1 min-h-0">
			<JsonCanvas :key="choice" ref="editor" v-model="canvas" v-model:viewport="viewport" :host="host" />
		</div>
	</div>
</template>
