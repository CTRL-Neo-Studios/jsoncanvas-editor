<script setup lang="ts">
import { computed, inject, ref, useTemplateRef, watch } from 'vue'
import { useElementSize } from '@vueuse/core'
import UButton from '@nuxt/ui/components/Button.vue'
import UDropdownMenu from '@nuxt/ui/components/DropdownMenu.vue'
import UTooltip from '@nuxt/ui/components/Tooltip.vue'
import { isPresetColor, PRESET_COLORS } from '../../core'
import type { CanvasActions, ToolbarItem } from '../composables/useCanvasActions'
import { CANVAS_CONTENT } from '../composables/useCanvasContent'

/** The floating toolbar above the selection: its buttons come from `actions.toolbarItems`. */
const props = defineProps<{
	actions: CanvasActions
	/** The canvas's size on screen, to keep the toolbar inside it. */
	size: { width: number, height: number }
}>()
const content = inject(CANVAS_CONTENT)!

const el = useTemplateRef<HTMLDivElement>('el')
const { width, height } = useElementSize(el, undefined, { box: 'border-box' })
const MARGIN = 10
const style = computed(() => {
	const a = props.actions.toolbarAnchor.value
	if (!a) return
	const clamp = (v: number, max: number) => Math.max(MARGIN, Math.min(v, max - MARGIN))
	return { left: `${clamp(a.x - width.value / 2, props.size.width - width.value)}px`, top: `${clamp(a.y - height.value, props.size.height - height.value)}px` }
})

// The color picker opens in the toolbar and closes when the selection changes.
const colorsOpen = ref(false)
watch([props.actions.selectedNodes, props.actions.selectedEdges], () => (colorsOpen.value = false))
const current = props.actions.currentColor
const custom = computed(() => (current.value && !isPresetColor(current.value) ? current.value : '#000000'))

function click(item: ToolbarItem) {
	if (item.id === 'color') colorsOpen.value = !colorsOpen.value
	else item.onSelect?.()
}

function pick(color: string) {
	props.actions.setColor(color)
	colorsOpen.value = false
}
</script>

<template>
	<div v-if="style && actions.toolbarItems.value.length" ref="el" class="jc-toolbar jc-chrome" :style="style">
		<div class="jc-toolbar-buttons">
			<template v-for="item in actions.toolbarItems.value" :key="item.id">
				<UDropdownMenu v-if="item.children" :items="item.children" :modal="false" :content="{ side: 'bottom', align: 'start' }">
					<UButton :icon="item.icon" :aria-label="item.label" :title="item.label" color="neutral" variant="ghost" size="sm" />
				</UDropdownMenu>
				<UTooltip v-else :text="item.label" :content="{ side: 'top' }">
					<UButton
						:icon="item.icon"
						:aria-label="item.label"
						:data-action="item.id"
						:active="item.id === 'color' && colorsOpen"
						color="neutral"
						variant="ghost"
						active-variant="soft"
						size="sm"
						@click="click(item)"
					/>
				</UTooltip>
			</template>
		</div>
		<div v-if="colorsOpen" class="jc-swatches">
			<button type="button" class="jc-swatch" :class="{ 'jc-active': !current }" :aria-label="content.messages().noColor" @click="pick('')" />
			<button
				v-for="c in PRESET_COLORS"
				:key="c"
				type="button"
				class="jc-swatch jc-themed"
				:class="[`jc-color-${c}`, { 'jc-active': current === c }]"
				:aria-label="c"
				:data-color="c"
				@click="pick(c)"
			/>
			<label
				class="jc-swatch jc-swatch-custom jc-themed"
				:class="{ 'jc-active': current && !isPresetColor(current) }"
				:style="{ '--jc-color': custom }"
				:title="content.messages().customColor"
			>
				<!-- Dragging in the system picker previews; closing it saves. -->
				<input
					type="color"
					:value="custom"
					:aria-label="content.messages().customColor"
					@input="actions.setColor(($event.target as HTMLInputElement).value, true)"
					@change="pick(($event.target as HTMLInputElement).value)"
				>
			</label>
		</div>
	</div>
</template>
