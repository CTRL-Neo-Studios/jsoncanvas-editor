<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import UButton from '@nuxt/ui/components/Button.vue'
import UFormField from '@nuxt/ui/components/FormField.vue'
import UModal from '@nuxt/ui/components/Modal.vue'
import USelect from '@nuxt/ui/components/Select.vue'
import USlider from '@nuxt/ui/components/Slider.vue'
import USwitch from '@nuxt/ui/components/Switch.vue'
import { exportSize } from '../../core'
import { CANVAS_CONTENT } from '../composables/useCanvasContent'
import type { CanvasExport } from '../composables/useCanvasExport'
import { format } from '../messages'

/** Obsidian's export dialog: frame, zoom (with the image's size), watermark, privacy; the host saves the PNG. */
const props = defineProps<{ exporter: CanvasExport, hasWatermark: boolean }>()
const emit = defineEmits<{ close: [] }>()
const content = inject(CANVAS_CONTENT)!
const m = computed(() => content.messages())

const frame = ref<'full' | 'viewport'>('full')
/** log2 of the zoom: 50% to 200%. */
const zoom = ref(0)
const watermark = ref(true)
const privacy = ref(false)
const saving = ref(false)
const failed = ref(false)
const ratio = globalThis.devicePixelRatio || 1
const full = computed(() => frame.value === 'full')
const frames = computed(() => [{ label: m.value.fullCanvas, value: 'full' }, { label: m.value.viewportOnly, value: 'viewport' }])
const dimensions = computed(() => {
	const size = exportSize(props.exporter.frameBox(), 2 ** zoom.value * ratio)
	const n = new Intl.NumberFormat()
	return format(m.value.exportDimensions, { width: n.format(size.width), height: n.format(size.height) })
})

async function save() {
	saving.value = true
	failed.value = false
	try {
		// The viewport is drawn as it's shown, without the watermark (as Obsidian does).
		const png = await props.exporter.exportPng(full.value
			? { scale: 2 ** zoom.value * ratio, watermark: watermark.value, privacy: privacy.value }
			: { frame: 'viewport', watermark: false, privacy: privacy.value })
		await content.host()?.saveImage?.(png)
		emit('close')
	}
	catch {
		// The host's own failure is reported through the canvas's `error` event; either way the dialog stays.
		failed.value = true
	}
	finally {
		saving.value = false
	}
}
</script>

<template>
	<UModal :open="true" :title="m.exportAsImage" :description="m.exportDescription" @update:open="open => open || emit('close')">
		<template #body>
			<div class="jc-export-form">
				<UFormField :label="m.exportFrame" :description="m.exportFrameDescription">
					<USelect v-model="frame" :items="frames" class="jc-export-select" />
				</UFormField>
				<UFormField v-if="full" :label="m.exportZoom" :description="dimensions">
					<div class="jc-export-zoom">
						<USlider v-model="zoom" :min="-1" :max="1" :step="0.01" />
						<span>{{ (2 ** zoom).toFixed(2) }}</span>
					</div>
				</UFormField>
				<USwitch v-if="full && hasWatermark" v-model="watermark" :label="m.showWatermark" :description="m.showWatermarkDescription" />
				<USwitch v-model="privacy" :label="m.privacyMode" :description="m.privacyModeDescription" />
				<p v-if="failed" class="jc-export-error">
					{{ m.exportFailed }}
				</p>
			</div>
		</template>
		<template #footer>
			<UButton :label="m.save" :loading="saving" class="jc-export-save" @click="save" />
		</template>
	</UModal>
</template>
