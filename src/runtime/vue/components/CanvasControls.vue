<script setup lang="ts">
import { computed, inject } from 'vue'
import type { DropdownMenuItem } from '@nuxt/ui'
import UButton from '@nuxt/ui/components/Button.vue'
import UDropdownMenu from '@nuxt/ui/components/DropdownMenu.vue'
import UTooltip from '@nuxt/ui/components/Tooltip.vue'
import type { CanvasSettings } from '../composables/useCanvasActions'
import { CANVAS_CONTENT } from '../composables/useCanvasContent'

/** The controls at the canvas's right: settings, zoom, undo/redo, export and help. */
const props = defineProps<{
	settings: CanvasSettings
	canUndo: boolean
	canRedo: boolean
	/** The host can save an exported image. */
	canExport?: boolean
}>()
const emit = defineEmits<{ zoomIn: [], zoomOut: [], resetZoom: [], zoomToFit: [], undo: [], redo: [], export: [], help: [], setting: [key: keyof CanvasSettings, value: boolean] }>()
const content = inject(CANVAS_CONTENT)!
const m = computed(() => content.messages())

const settingsItems = computed((): DropdownMenuItem[] => {
	const t = content.messages()
	const toggle = (label: string, icon: string, key: keyof CanvasSettings): DropdownMenuItem => ({
		label, icon, type: 'checkbox', checked: props.settings[key].value, onUpdateChecked: (v: boolean) => emit('setting', key, v),
	})
	return [
		toggle(t.snapToGrid, 'i-lucide-grid-3x3', 'snapToGrid'),
		toggle(t.snapToObjects, 'i-lucide-magnet', 'snapToObjects'),
		toggle(t.readonly, 'i-lucide-lock', 'readonly'),
	]
})
</script>

<template>
	<div class="jc-controls jc-chrome">
		<div class="jc-control-group">
			<UTooltip v-if="settings.readonly.value" :text="m.disableReadonly" :content="{ side: 'left' }">
				<UButton icon="i-lucide-lock" :aria-label="m.disableReadonly" color="neutral" variant="ghost" size="sm" @click="emit('setting', 'readonly', false)" />
			</UTooltip>
			<UDropdownMenu v-else :items="settingsItems" :modal="false" :content="{ side: 'left', align: 'start' }">
				<UButton icon="i-lucide-settings" :aria-label="m.settings" :title="m.settings" color="neutral" variant="ghost" size="sm" />
			</UDropdownMenu>
		</div>
		<div class="jc-control-group">
			<UTooltip :text="m.zoomIn" :content="{ side: 'left' }">
				<UButton icon="i-lucide-plus" :aria-label="m.zoomIn" color="neutral" variant="ghost" size="sm" @click="emit('zoomIn')" />
			</UTooltip>
			<UTooltip :text="m.resetZoom" :content="{ side: 'left' }">
				<UButton icon="i-lucide-rotate-cw" :aria-label="m.resetZoom" color="neutral" variant="ghost" size="sm" @click="emit('resetZoom')" />
			</UTooltip>
			<UTooltip :text="`${m.zoomToFit} (Shift+1)`" :content="{ side: 'left' }">
				<UButton icon="i-lucide-maximize" :aria-label="m.zoomToFit" color="neutral" variant="ghost" size="sm" @click="emit('zoomToFit')" />
			</UTooltip>
			<UTooltip :text="m.zoomOut" :content="{ side: 'left' }">
				<UButton icon="i-lucide-minus" :aria-label="m.zoomOut" color="neutral" variant="ghost" size="sm" @click="emit('zoomOut')" />
			</UTooltip>
		</div>
		<div v-if="!settings.readonly.value" class="jc-control-group">
			<UTooltip :text="m.undo" :content="{ side: 'left' }">
				<UButton icon="i-lucide-undo-2" :aria-label="m.undo" :disabled="!canUndo" color="neutral" variant="ghost" size="sm" @click="emit('undo')" />
			</UTooltip>
			<UTooltip :text="m.redo" :content="{ side: 'left' }">
				<UButton icon="i-lucide-redo-2" :aria-label="m.redo" :disabled="!canRedo" color="neutral" variant="ghost" size="sm" @click="emit('redo')" />
			</UTooltip>
		</div>
		<div class="jc-control-group">
			<UTooltip v-if="canExport" :text="m.exportAsImage" :content="{ side: 'left' }">
				<UButton icon="i-lucide-image-down" :aria-label="m.exportAsImage" color="neutral" variant="ghost" size="sm" @click="emit('export')" />
			</UTooltip>
			<UTooltip :text="m.help" :content="{ side: 'left' }">
				<UButton icon="i-lucide-circle-help" :aria-label="m.help" color="neutral" variant="ghost" size="sm" @click="emit('help')" />
			</UTooltip>
		</div>
	</div>
</template>
