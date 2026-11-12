<script setup lang="ts">
import { computed, inject, useTemplateRef, watch } from 'vue'
import type { JSONCanvasTextNode } from '../../core'
import { CANVAS_CONTENT } from '../composables/useCanvasContent'
import type { SceneNode } from '../composables/useCanvasEditor'
import { focusCanvas } from '../utils/inline-edit'
import { SlotRender } from '../utils/slot-render'
import MarkdownView from './MarkdownView.vue'

/** A text card: Markdown, or an editor while editing. Both can be replaced by slots. */
const props = defineProps<{
	item: SceneNode
	editing: boolean
}>()
const content = inject(CANVAS_CONTENT)!
const { slots, interaction } = content
const node = computed(() => props.item.node as JSONCanvasTextNode)

const root = useTemplateRef<HTMLDivElement>('root')
const textarea = useTemplateRef<HTMLTextAreaElement>('textarea')
watch(textarea, (el) => {
	if (!el) return
	el.focus({ preventScroll: true })
	el.setSelectionRange(el.value.length, el.value.length)
}, { flush: 'post' })

/** Ends editing, giving the keyboard back to the canvas. */
function done() {
	if (root.value) focusCanvas(root.value)
	interaction.finishEditing()
}
</script>

<template>
	<div ref="root" class="jc-node-content jc-text" :class="{ 'jc-editing': editing }">
		<template v-if="editing">
			<SlotRender
				v-if="slots['text-editor']"
				:render="slots['text-editor']"
				:props="{ node, text: node.text, update: interaction.draft, done }"
			/>
			<textarea
				v-else
				ref="textarea"
				class="jc-text-editor"
				:value="node.text"
				@input="interaction.draft(($event.target as HTMLTextAreaElement).value)"
				@keydown.escape="done"
			/>
		</template>
		<SlotRender v-else-if="slots['text-display']" :render="slots['text-display']" :props="{ node, text: node.text }" />
		<MarkdownView v-else :text="node.text" />
	</div>
</template>
