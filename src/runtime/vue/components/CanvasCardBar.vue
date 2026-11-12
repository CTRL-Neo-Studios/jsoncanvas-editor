<script setup lang="ts">
import { computed, inject } from 'vue'
import UButton from '@nuxt/ui/components/Button.vue'
import UTooltip from '@nuxt/ui/components/Tooltip.vue'
import { NODE_SIZE, type Point } from '../../core'
import type { CanvasActions, CardTemplate, NewCardKind } from '../composables/useCanvasActions'
import { CANVAS_CONTENT } from '../composables/useCanvasContent'

/** The bar at the canvas's bottom: click a button to add a card in the middle of the view, or drag it into place. */
const props = defineProps<{
	actions: CanvasActions
	/** Custom cards offered after the built-in ones. */
	templates: readonly CardTemplate[]
	/** The middle of the view (world units). */
	center: () => Point
}>()
const content = inject(CANVAS_CONTENT)!

const buttons = computed(() => {
	const m = content.messages(), pick = !!content.host()?.pickFile
	const builtIn: Array<{ kind: NewCardKind, label: string, icon: string, size: { width: number, height: number } }> = [
		{ kind: 'card', label: m.dragToAddCard, icon: 'i-lucide-sticky-note', size: NODE_SIZE.text },
		...(pick
			? [
					{ kind: 'file' as const, label: m.dragToAddFile, icon: 'i-lucide-file-text', size: NODE_SIZE.file },
					{ kind: 'media' as const, label: m.dragToAddMedia, icon: 'i-lucide-file-image', size: NODE_SIZE.file },
				]
			: []),
	]
	return [
		...builtIn,
		...props.templates.map(t => ({ kind: t, label: t.label, icon: t.icon, size: { width: t.node.width, height: t.node.height } })),
	]
})

function press(e: PointerEvent, b: (typeof buttons.value)[number]) {
	if (e.button !== 0) return
	content.interaction.dragNew(
		e,
		b.size,
		box => props.actions.add(b.kind, { box }),
		() => props.actions.add(b.kind, { at: props.center(), center: true }),
	)
}
</script>

<template>
	<div class="jc-card-bar jc-chrome">
		<UTooltip v-for="b in buttons" :key="b.label" :text="b.label" :content="{ side: 'top' }">
			<UButton :icon="b.icon" :aria-label="b.label" color="neutral" variant="ghost" class="jc-card-bar-button" @pointerdown="press($event, b)" />
		</UTooltip>
	</div>
</template>
