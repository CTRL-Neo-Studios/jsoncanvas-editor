<script setup lang="ts">
import { useTemplateRef, watch } from 'vue'
import type { SceneEdge } from '../composables/useCanvasEditor'
import type { LabelEditing } from '../composables/useCanvasInteraction'

/** An edge's label at the middle of its curve; editable in place. */
const props = defineProps<{
	item: SceneEdge
	editing?: LabelEditing
}>()
const emit = defineEmits<{ done: [text: string] }>()

const input = useTemplateRef<HTMLDivElement>('input')

// The editor's text is set once, not rendered, so Vue never rewrites what's being typed.
watch(input, (el) => {
	if (!el) return
	el.textContent = props.item.edge.label ?? ''
	el.focus()
	const selection = getSelection()
	const at = props.editing?.at
	const caret = at && document.caretPositionFromPoint?.(at.x, at.y)
	if (caret && el.contains(caret.offsetNode)) selection?.collapse(caret.offsetNode, caret.offset)
	else selection?.selectAllChildren(el)
}, { flush: 'post' })

/** Escape ends editing by handing focus back to the canvas. */
function onEscape(e: KeyboardEvent) {
	(e.target as HTMLElement).closest<HTMLElement>('.jc-canvas')?.focus({ preventScroll: true })
}
</script>

<template>
	<div
		class="jc-edge-label"
		:class="[item.color.class, { 'jc-editing': editing }]"
		:style="[item.color.style, { transform: `translate(${item.shape.label.x}px, ${item.shape.label.y}px)` }]"
		:data-edge="item.key"
	>
		<div
			v-if="editing"
			ref="input"
			class="jc-edge-label-text"
			contenteditable="plaintext-only"
			spellcheck="false"
			data-placeholder="Add text"
			@blur="emit('done', ($event.target as HTMLElement).innerText)"
			@keydown.escape="onEscape"
		/>
		<div v-else class="jc-edge-label-text">
			{{ item.edge.label }}
		</div>
	</div>
</template>
