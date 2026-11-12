<script setup lang="ts">
import { computed, inject } from 'vue'
import UModal from '@nuxt/ui/components/Modal.vue'
import { CANVAS_CONTENT } from '../composables/useCanvasContent'
import type { WheelBehavior } from '../composables/useViewport'
import { IS_MAC } from '../utils/platform'

/** What the pointer and keys do, with this platform's key names. */
const props = defineProps<{ wheelBehavior: WheelBehavior }>()
const emit = defineEmits<{ close: [] }>()
const content = inject(CANVAS_CONTENT)!

const KEYS: Record<string, string> = IS_MAC
	? { Mod: '⌘', Shift: '⇧', Alt: '⌥', Ctrl: '⌃', Space: 'Space', Backspace: '⌫', Delete: '⌦' }
	: { Mod: 'Ctrl', Shift: 'Shift', Alt: 'Alt', Ctrl: 'Ctrl', Space: 'Space', Backspace: 'Backspace', Delete: 'Delete' }

/** `combo`'s keys (`+`-separated) in this platform's names, joined its way. */
const keys = (combo: string) => combo.split('+').map(k => KEYS[k] ?? k).join(IS_MAC ? ' ' : ' + ')

const rows = computed(() => {
	const m = content.messages()
	const drag = m.keyDrag, scroll = m.keyScroll
	// With the wheel set to zoom, panning and zooming swap.
	const zoomWheel = props.wheelBehavior === 'zoom'
	const rows: Array<[string, string[]]> = [
		[m.helpPan, zoomWheel ? [`Space+${drag}`, `Mod+${scroll}`, `Space+${scroll}`] : [`Space+${drag}`, scroll]],
		[m.helpPanHorizontally, zoomWheel ? [`Mod+Shift+${scroll}`, `Shift+Space+${scroll}`] : [`Shift+${scroll}`]],
		[m.helpZoom, zoomWheel ? [scroll] : [`Mod+${scroll}`, `Space+${scroll}`]],
		[m.zoomToFit, ['Shift+1']],
		[m.zoomToSelection, ['Shift+2']],
		[m.selectAll, ['Mod+A']],
		[m.helpAddRemoveSelection, [`Shift+${m.keyClick}`, `Shift+${m.keyDragToSelect}`]],
		[m.helpCreateWithSize, [`Mod+${m.keyDragToSelect}`]],
		[m.helpClone, [IS_MAC ? `Alt+${drag}` : `Ctrl+${drag}`]],
		[m.helpConstrain, [`Shift+${drag}`]],
		[m.helpNoSnap, [IS_MAC ? 'Ctrl' : 'Alt']],
		[m.helpRemove, ['Backspace', 'Delete']],
		[m.undo, ['Mod+Z']],
		[m.redo, ['Mod+Y', 'Mod+Shift+Z']],
	]
	return rows.map(([label, combos]) => ({ label, combos: combos.map(keys) }))
})
</script>

<template>
	<UModal :open="true" :title="content.messages().help" @update:open="open => open || emit('close')">
		<template #body>
			<dl class="jc-help">
				<div v-for="row in rows" :key="row.label" class="jc-help-row">
					<dt>{{ row.label }}</dt>
					<dd>
						<kbd v-for="c in row.combos" :key="c">{{ c }}</kbd>
					</dd>
				</div>
			</dl>
		</template>
	</UModal>
</template>
