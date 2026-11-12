<script setup lang="ts">
import { computed, inject, onBeforeUnmount, shallowRef, useTemplateRef, watch } from 'vue'
import UIcon from '@nuxt/ui/components/Icon.vue'
import { canvasMinimap, fileExtension, fileKind, fileName, markdownSection, markdownSectionRange, parseCanvas, type JSONCanvasFileNode } from '../../core'
import { CANVAS_CONTENT } from '../composables/useCanvasContent'
import type { SceneNode } from '../composables/useCanvasEditor'
import type { ResolvedFile } from '../host'
import { format } from '../messages'
import { focusCanvas } from '../utils/inline-edit'
import { SlotRender } from '../utils/slot-render'
import CanvasMinimap from './CanvasMinimap.vue'
import MarkdownView from './MarkdownView.vue'

/** A file card, drawn by the file's kind (or the host's renderer for its extension); a note can be edited in place. */
const props = defineProps<{
	item: SceneNode
	editing: boolean
}>()
const content = inject(CANVAS_CONTENT)!
const { slots, interaction } = content
const node = computed(() => props.item.node as JSONCanvasFileNode)

const file = shallowRef<ResolvedFile>()
/** A note's or canvas's text, once read; `null` when it couldn't be, or isn't read (other files, `fileRenderers`). */
const text = shallowRef<string | null>()

const ext = computed(() => file.value?.ext ?? fileExtension(node.value.file))
// `fileKind` goes by a path's extension.
const kind = computed(() => fileKind(`file.${ext.value}`))
const renderer = computed(() => content.fileRenderers()?.[ext.value])
const url = computed(() => file.value?.url)

watch([() => node.value.file, content.fileVersion], ([path]) => {
	file.value = text.value = undefined
	void content.track(load(path))
}, { immediate: true })

async function load(path: string) {
	// A host that fails to answer gets a generic card, never the "missing" one with its Remove button.
	const resolved = await content.resolveFile(path).catch((): ResolvedFile => ({ exists: true }))
	if (path !== node.value.file) return
	file.value = resolved
	if (!resolved.exists || renderer.value || !['markdown', 'canvas'].includes(kind.value)) return void (text.value = null)
	const read = await content.readText(path).catch(() => null)
	if (path === node.value.file) text.value = read
}

// Another card saved the note: show what it saved.
watch(content.written, (w) => {
	if (w?.path === node.value.file && typeof text.value === 'string') text.value = w.text
})

/** What a note card shows: the note, or the heading or block it's narrowed to. */
const section = computed(() => (typeof text.value === 'string' ? markdownSection(text.value, node.value.subpath ?? '') : undefined))
const minimap = computed(() => {
	if (typeof text.value !== 'string') return
	try {
		return canvasMinimap(parseCanvas(text.value).canvas)
	}
	catch {
		return undefined
	}
})
const pdf = computed(() => url.value && `${url.value}${node.value.subpath?.startsWith('#page=') ? node.value.subpath : ''}`)
const canSwap = computed(() => !content.readonly() && !!content.host()?.pickFile)

// An audio card is as tall as its player (plus the border).
const audio = useTemplateRef<HTMLAudioElement>('audio')
watch(audio, (el) => {
	if (el) content.setHeight(props.item.key, (el.offsetHeight || 42) + 2)
}, { flush: 'post' })

/** While editing: the note as it was when editing started, the card's section of it, and that section's text. */
const edit = shallowRef<{ path: string, note: string, from: number, to: number, text: string }>()
/** Typed since the last save. */
let typed: string | undefined
let saveTimer: ReturnType<typeof setTimeout> | undefined
let saving = Promise.resolve()

const editor = useTemplateRef<HTMLDivElement>('editor')
const textarea = useTemplateRef<HTMLTextAreaElement>('textarea')
watch(textarea, (el) => {
	if (!el) return
	el.focus({ preventScroll: true })
	el.setSelectionRange(el.value.length, el.value.length)
}, { flush: 'post' })

watch([() => props.editing, text], ([on, note]) => {
	if (!on) {
		save()
		edit.value = undefined
		return
	}
	if (edit.value || note === undefined) return
	const range = typeof note === 'string' && kind.value === 'markdown' ? markdownSectionRange(note, node.value.subpath ?? '') : undefined
	// Missing, unreadable, or narrowed to a heading or block the note lacks: nothing to edit.
	if (note === null || !range) return done()
	edit.value = { path: node.value.file, note, ...range, text: note.slice(range.from, range.to) }
}, { immediate: true })

function update(value: string) {
	typed = value
	clearTimeout(saveTimer)
	saveTimer = setTimeout(save, 300)
}

/** Writes the note with what's typed in place of the section; one write at a time, in order. */
function save() {
	clearTimeout(saveTimer)
	const e = edit.value
	if (!e || typed === undefined) return
	const note = e.note.slice(0, e.from) + typed + e.note.slice(e.to)
	typed = undefined
	// A failed write is reported by the host guard (the `error` event); the editor keeps the text.
	saving = saving.then(() => content.writeText(e.path, note)).catch(() => {})
	void content.track(saving)
}
onBeforeUnmount(save)

/** Ends editing, giving the keyboard back to the canvas. */
function done() {
	if (editor.value) focusCanvas(editor.value)
	interaction.finishEditing()
}
</script>

<template>
	<div v-if="edit" ref="editor" class="jc-node-content jc-text jc-editing">
		<SlotRender
			v-if="slots['note-editor']"
			:render="slots['note-editor']"
			:props="{ node, path: edit.path, text: edit.text, update, done }"
		/>
		<textarea
			v-else
			ref="textarea"
			class="jc-text-editor"
			:value="edit.text"
			@input="update(($event.target as HTMLTextAreaElement).value)"
			@keydown.escape="done"
		/>
	</div>
	<div v-else-if="!file" class="jc-node-content" />
	<div v-else-if="!file.exists" class="jc-node-content jc-missing jc-interactive">
		<p>
			<UIcon name="i-lucide-triangle-alert" class="jc-icon" />
			{{ format(content.messages().fileNotFound, { file: node.file }) }}
		</p>
		<div v-if="!content.readonly()" class="jc-actions">
			<button v-if="canSwap" type="button" class="jc-pill" @click="interaction.swapFile(item.key)">
				<UIcon name="i-lucide-repeat" class="jc-icon" />{{ content.messages().swapFile }}
			</button>
			<button type="button" class="jc-pill jc-danger" @click="interaction.remove(item.key)">
				<UIcon name="i-lucide-trash-2" class="jc-icon" />{{ content.messages().remove }}
			</button>
		</div>
	</div>
	<div v-else-if="renderer" class="jc-node-content">
		<component :is="renderer" :node="node" :file="file" :host="content.host()" />
	</div>
	<div v-else-if="kind === 'image' && url" class="jc-node-content jc-media">
		<img :src="url" alt="" draggable="false" @load="content.setAspect(item.key, ($event.target as HTMLImageElement).naturalWidth / ($event.target as HTMLImageElement).naturalHeight)">
	</div>
	<div v-else-if="kind === 'video' && url" class="jc-node-content jc-media">
		<video :src="url" controls preload="metadata" @loadedmetadata="content.setAspect(item.key, ($event.target as HTMLVideoElement).videoWidth / ($event.target as HTMLVideoElement).videoHeight)" />
	</div>
	<div v-else-if="kind === 'audio' && url" class="jc-node-content jc-media">
		<audio ref="audio" :src="url" controls preload="metadata" />
	</div>
	<div v-else-if="kind === 'pdf' && pdf" class="jc-node-content">
		<iframe class="jc-frame" :src="pdf" />
	</div>
	<div v-else-if="kind === 'markdown' && text !== null" class="jc-node-content jc-file-markdown">
		<MarkdownView v-if="section !== undefined" :text="section" />
		<p v-else-if="text !== undefined" class="jc-note">
			{{ format(content.messages().sectionNotFound, { subpath: node.subpath ?? '' }) }}
		</p>
	</div>
	<div v-else-if="kind === 'canvas' && minimap" class="jc-node-content jc-file-canvas" data-open>
		<CanvasMinimap :minimap="minimap" />
	</div>
	<div v-else class="jc-node-content jc-card" data-open>
		<UIcon name="i-lucide-file" class="jc-icon" />
		<span class="jc-card-name">{{ file.name ?? fileName(node.file) }}</span>
	</div>
</template>
