<script setup lang="ts">
import { computed, useId, useTemplateRef, watch } from 'vue'
import { gridSpacing, type JSONCanvas, type Viewport } from '../../core'
import { useCanvasEditor, type CardLabels } from '../composables/useCanvasEditor'
import type { WheelBehavior } from '../composables/useViewport'
import CanvasScene from './CanvasScene.vue'

const props = withDefaults(defineProps<{
	/** What a plain mouse wheel does; the other happens with Mod or Space held. */
	wheelBehavior?: WheelBehavior
	/** Names above file and link cards. */
	cardLabels?: CardLabels
	/** How much further out (log2 zoom units) card content stays before placeholders show. */
	zoomBreakpoint?: number
}>(), { wheelBehavior: 'pan', cardLabels: 'always', zoomBreakpoint: 0 })

/** The document. Replace it to load another; it is copied and normalized, never changed in place. */
const canvasModel = defineModel<JSONCanvas>({ required: true })
/** Where the view is; set when it comes to rest. Without one at mount, the view fits the canvas. */
const viewportModel = defineModel<Viewport>('viewport')

const el = useTemplateRef<HTMLDivElement>('el')
const editor = useCanvasEditor(el, {
	canvas: () => canvasModel.value,
	wheelBehavior: () => props.wheelBehavior,
	zoomBreakpointOffset: () => props.zoomBreakpoint,
	initialViewport: () => viewportModel.value,
	onViewportSettled: (v) => {
		viewportModel.value = v
	},
})
const { visibleNodes, visibleEdges, zoomedOut, contentHidden } = editor
const { view, size, scale, settledZoom, spaceHeld, panning, moving } = editor.viewport

// Compared by value: the parent may hand back what was emitted as a different (reactive) object.
watch(viewportModel, (v) => {
	if (v && size.width && (v.x !== view.x || v.y !== view.y || v.zoom !== view.zoom)) editor.viewport.setViewport(v)
})

const transform = computed(() =>
	`translate(${size.width / 2}px, ${size.height / 2}px) scale(${scale.value}) translate(${-view.x}px, ${-view.y}px)`)
/** Card labels, edge strokes and arrows keep a readable size: √(1/scale), updated once the view is at rest. */
const zoomMultiplier = computed(() => Math.sqrt(1 / 2 ** settledZoom.value))
const patternId = useId()
const grid = computed(() => {
	const step = gridSpacing(view.zoom) * scale.value
	return { step, x: size.width / 2 - ((view.x * scale.value) % step), y: size.height / 2 - ((view.y * scale.value) % step) }
})

function onPointerDown(e: PointerEvent) {
	el.value?.focus({ preventScroll: true })
	editor.viewport.onPointerDown(e)
}

defineExpose({
	/** The normalized document being shown. */
	canvas: editor.canvas,
	/** What in the document can't be shown as the spec intends. */
	issues: editor.issues,
	viewport: view,
	zoomToFit: editor.zoomToFit,
	zoomToBBox: editor.viewport.zoomToBBox,
	zoomBy: editor.viewport.zoomBy,
	setViewport: editor.viewport.setViewport,
	screenToWorld: editor.viewport.screenToWorld,
})
</script>

<template>
	<div
		ref="el"
		class="jc-canvas"
		:class="{ 'jc-zoomed-out': zoomedOut, 'jc-space': spaceHeld, 'jc-panning': panning, 'jc-moving': moving }"
		:style="{ '--jc-zoom-multiplier': zoomMultiplier }"
		tabindex="-1"
		@wheel="editor.viewport.onWheel"
		@pointerdown="onPointerDown"
		@contextmenu.capture="editor.viewport.onContextMenu"
		@keydown="editor.viewport.onKeyDown"
		@keyup="editor.viewport.onKeyUp"
		@blur="spaceHeld = false"
	>
		<svg class="jc-background">
			<defs>
				<pattern :id="patternId" patternUnits="userSpaceOnUse" :x="grid.x" :y="grid.y" :width="grid.step" :height="grid.step">
					<circle cx="0.7" cy="0.7" r="0.7" />
				</pattern>
			</defs>
			<rect width="100%" height="100%" :fill="`url(#${patternId})`" />
		</svg>
		<div class="jc-world" :style="{ transform }">
			<CanvasScene :nodes="visibleNodes" :edges="visibleEdges" :content-hidden="contentHidden" :card-labels="cardLabels" />
		</div>
	</div>
</template>
