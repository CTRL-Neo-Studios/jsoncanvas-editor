<script setup lang="ts">
import { computed, inject, shallowRef, useTemplateRef, watch } from 'vue'
import UIcon from '@nuxt/ui/components/Icon.vue'
import { canvasMinimap, fileExtension, fileKind, fileName, markdownSection, parseCanvas, type JSONCanvasFileNode } from '../../core'
import { CANVAS_CONTENT } from '../composables/useCanvasContent'
import type { SceneNode } from '../composables/useCanvasEditor'
import type { ResolvedFile } from '../host'
import { format } from '../messages'
import CanvasMinimap from './CanvasMinimap.vue'
import MarkdownView from './MarkdownView.vue'

/** A file card, drawn by the file's kind (or the host's renderer for its extension). */
const props = defineProps<{ item: SceneNode }>()
const content = inject(CANVAS_CONTENT)!
const { interaction } = content
const node = computed(() => props.item.node as JSONCanvasFileNode)

const file = shallowRef<ResolvedFile>()
/** A note's or canvas's text, once read; `null` when it couldn't be. */
const text = shallowRef<string | null>()

const ext = computed(() => file.value?.ext ?? fileExtension(node.value.file))
// `fileKind` goes by a path's extension.
const kind = computed(() => fileKind(`file.${ext.value}`))
const renderer = computed(() => content.fileRenderers()?.[ext.value])
const url = computed(() => file.value?.url)

watch([() => node.value.file, content.fileVersion], async ([path]) => {
	file.value = text.value = undefined
	// A host that fails to answer gets a generic card, never the "missing" one with its Remove button.
	const resolved = await content.resolveFile(path).catch((): ResolvedFile => ({ exists: true }))
	if (path !== node.value.file) return
	file.value = resolved
	if (!resolved.exists || renderer.value || !['markdown', 'canvas'].includes(kind.value)) return
	const read = await content.readText(path).catch(() => null)
	if (path === node.value.file) text.value = read
}, { immediate: true })

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
</script>

<template>
	<div v-if="!file" class="jc-node-content" />
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
