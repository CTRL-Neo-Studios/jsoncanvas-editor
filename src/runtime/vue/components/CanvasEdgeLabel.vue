<script setup lang="ts">
import { useTemplateRef, watch } from 'vue'
import type { SceneEdge } from '../composables/useCanvasEditor'
import type { LabelEditing } from '../composables/useCanvasInteraction'
import { focusCanvas, startInlineEdit } from '../utils/inline-edit'

/** An edge's label at the middle of its curve; editable in place. */
const props = defineProps<{
	item: SceneEdge
	editing?: LabelEditing
}>()
const emit = defineEmits<{ done: [text: string] }>()

const input = useTemplateRef<HTMLDivElement>('input')
watch(input, (el) => {
	if (el) startInlineEdit(el, props.item.edge.label ?? '', props.editing?.at)
}, { flush: 'post' })
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
			@keydown.escape="focusCanvas($event.target as Element)"
		/>
		<div v-else class="jc-edge-label-text">
			{{ item.edge.label }}
		</div>
	</div>
</template>
