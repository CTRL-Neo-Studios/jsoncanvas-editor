<script setup lang="ts">
import UDropdownMenu from '@nuxt/ui/components/DropdownMenu.vue'
import type { CanvasMenu } from '../composables/useCanvasInteraction'

/** A menu at a point in the canvas, opened by the canvas rather than a button. */
defineProps<{ menu?: CanvasMenu }>()
const emit = defineEmits<{ close: [] }>()

// Not modal, so nothing traps focus: an item can move it (Edit label focuses the label's editor) and it stays there.
const content = { side: 'bottom', align: 'start', sideOffset: 2, onCloseAutoFocus: (e: Event) => e.preventDefault() } as const
</script>

<template>
	<UDropdownMenu :open="!!menu" :modal="false" :items="menu?.items" :content="content" @update:open="open => open || emit('close')">
		<div class="jc-menu-anchor" :style="menu && { left: `${menu.x}px`, top: `${menu.y}px` }" />
	</UDropdownMenu>
</template>
