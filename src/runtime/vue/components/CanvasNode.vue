<script setup lang="ts">
import { computed, inject, onErrorCaptured, shallowRef, useTemplateRef, watch } from 'vue'
import UIcon from '@nuxt/ui/components/Icon.vue'
import { fileKind } from '../../core'
import { CANVAS_CONTENT } from '../composables/useCanvasContent'
import type { CardLabels, SceneNode } from '../composables/useCanvasEditor'
import type { LabelEditing } from '../composables/useCanvasInteraction'
import { focusCanvas, startInlineEdit } from '../utils/inline-edit'
import { SlotRender } from '../utils/slot-render'
import { boxStyle } from '../utils/style'
import FileCard from './FileCard.vue'
import LinkCard from './LinkCard.vue'
import TextCard from './TextCard.vue'

const props = defineProps<{
	item: SceneNode
	selected: boolean
	/** The only thing selected: its content takes the pointer (links, players, scrolling). */
	focused: boolean
	/** A text, custom or note card being edited. */
	editing: boolean
	/** A group whose label is being edited. */
	labelEditing?: LabelEditing
	/** Zoomed out past the breakpoint: show a placeholder instead of the content. */
	contentHidden: boolean
	cardLabels: CardLabels
	/** Drawn for an image: frames (web pages, PDFs) can't be captured, so they show their placeholder. */
	exporting?: boolean
	/** Part of a move in progress: drawn at the move's offset. */
	moved?: boolean
	/** Web pages and PDFs narrower than this (world units) show their placeholder instead of a live frame. */
	minFrameWidth?: number
}>()
const content = inject(CANVAS_CONTENT)!
const node = computed(() => props.item.node)

// A custom card for this node's type: a `#node-<type>` slot, else `nodeRenderers[type]`.
const type = computed(() => (typeof node.value.type === 'string' ? node.value.type : ''))
const customSlot = computed(() => content.slots[`node-${type.value}`])
const customComponent = computed(() => (customSlot.value ? undefined : content.nodeRenderers()?.[type.value]))
const root = useTemplateRef<HTMLDivElement>('root')
const customProps = computed(() => ({
	node: node.value,
	selected: props.selected,
	focused: props.focused,
	editing: props.editing,
	contentHidden: props.contentHidden,
	readonly: content.readonly(),
	host: content.host(),
	update: (patch: Record<string, unknown>) => content.interaction.updateNode(props.item.key, patch),
	done: () => {
		if (root.value) focusCanvas(root.value)
		content.interaction.finishEditing()
	},
}))
const style = computed(() => [boxStyle(props.item.box), props.item.color.style])
const groupLabel = computed(() => (props.item.kind === 'group' ? node.value.label as string | undefined : undefined))
/** Media, canvases and pages stay loaded when zoomed out, as in Obsidian (and so keep playing). */
const alwaysShown = computed(() => props.item.kind === 'link'
	|| (props.item.kind === 'file' && ['image', 'video', 'audio', 'canvas'].includes(fileKind(node.value.file as string))))
const framed = computed(() => props.item.kind === 'link' || (props.item.kind === 'file' && fileKind(node.value.file as string) === 'pdf'))
// Frames can't be captured in an image; and hundreds of frames too small to read would each load a page.
const placeholder = computed(() => props.exporting
	? framed.value
	: (framed.value && props.item.box.maxX - props.item.box.minX < (props.minFrameWidth ?? 0))
		|| (props.contentHidden && !alwaysShown.value && !props.editing))

const labelInput = useTemplateRef<HTMLDivElement>('labelInput')
watch(labelInput, (el) => {
	if (el) startInlineEdit(el, groupLabel.value ?? '', props.labelEditing?.at)
}, { flush: 'post' })

function onLabelKey(e: KeyboardEvent) {
	if (e.key === 'Escape' || (e.key === 'Enter' && !e.isComposing)) {
		e.preventDefault()
		focusCanvas(e.target as Element)
	}
}

// A group's background image: `cover` (the default), `repeat`, or `ratio` (cover, with the group kept to its shape).
const background = shallowRef<string>()
const backgroundPath = computed(() => (props.item.kind === 'group' && typeof node.value.background === 'string' ? node.value.background : ''))
watch([backgroundPath, content.fileVersion], async ([path]) => {
	background.value = undefined
	if (!path) return
	const url = (await content.track(content.resolveFile(path)).catch(() => undefined))?.url
	if (path === backgroundPath.value) background.value = url
}, { immediate: true })
watch([background, () => node.value.backgroundStyle], ([url, s]) => {
	if (props.item.kind !== 'group') return
	if (!url || s !== 'ratio') return content.setAspect(props.item.key, 0)
	const img = new Image()
	img.onload = () => content.setAspect(props.item.key, img.naturalWidth / img.naturalHeight)
	img.src = url
})
const backgroundCss = computed(() => background.value && {
	backgroundImage: `url(${JSON.stringify(background.value)})`,
	...(node.value.backgroundStyle === 'repeat'
		? { backgroundRepeat: 'repeat', backgroundPosition: 'top left', backgroundSize: 'auto' }
		: { backgroundRepeat: 'no-repeat', backgroundPosition: 'center', backgroundSize: 'cover' }),
})

// A card that fails to draw (a custom card throwing, say) shows so, and the rest of the canvas goes on. It tries
// again when its node changes.
const failed = shallowRef(false)
watch(() => props.item.node, () => (failed.value = false))
onErrorCaptured((error) => {
	console.error(error)
	failed.value = true
	return false
})
</script>

<template>
	<div
		ref="root"
		class="jc-node"
		:class="[`jc-node-${customSlot || customComponent ? 'custom' : item.kind}`, item.color.class, { 'jc-selected': selected, 'jc-focused': focused, 'jc-editing': editing, 'jc-moved': moved }]"
		:style="style"
		:data-id="item.node.id"
		:data-key="item.key"
		:data-type="type || undefined"
	>
		<div v-if="item.label && cardLabels !== 'never'" class="jc-node-label" :class="{ 'jc-hover-label': cardLabels === 'hover' }">
			{{ item.label }}
		</div>
		<div
			v-if="labelEditing"
			ref="labelInput"
			class="jc-group-label jc-editing"
			contenteditable="plaintext-only"
			spellcheck="false"
			@blur="content.interaction.finishLabel(item.key, ($event.target as HTMLElement).innerText)"
			@keydown="onLabelKey"
		/>
		<div v-else-if="groupLabel" class="jc-group-label">
			{{ groupLabel }}
		</div>
		<div class="jc-node-container">
			<div v-if="failed" class="jc-node-content jc-unsupported">
				<UIcon name="i-lucide-triangle-alert" class="jc-icon" />
				<span>{{ content.messages().cardFailed }}</span>
			</div>
			<div v-else-if="customSlot" class="jc-node-content">
				<SlotRender :render="customSlot" :props="customProps" />
			</div>
			<div v-else-if="customComponent" class="jc-node-content">
				<component :is="customComponent" v-bind="customProps" />
			</div>
			<div v-else-if="item.kind === 'group'" class="jc-node-content" :style="backgroundCss" />
			<div v-else-if="item.kind === 'unsupported'" class="jc-node-content jc-unsupported">
				<UIcon name="i-lucide-triangle-alert" class="jc-icon" />
				<span>{{ content.messages().unsupportedNode }}{{ typeof node.type === 'string' ? `: ${node.type}` : '' }}</span>
			</div>
			<div v-else-if="placeholder" class="jc-placeholder">
				<UIcon v-if="item.kind === 'text'" name="i-lucide-align-left" class="jc-placeholder-icon" />
				<template v-else>
					{{ item.label }}
				</template>
			</div>
			<TextCard v-else-if="item.kind === 'text'" :item="item" :editing="editing" />
			<FileCard v-else-if="item.kind === 'file'" :item="item" :editing="editing" />
			<LinkCard v-else :item="item" />
		</div>
	</div>
</template>
