<script setup lang="ts">
import { computed, useId, useTemplateRef, watch } from 'vue'
import { gridSpacing, type JSONCanvas, type Viewport } from '../../core'
import { useCanvasEditor, type CardLabels } from '../composables/useCanvasEditor'
import { useCanvasInteraction } from '../composables/useCanvasInteraction'
import type { WheelBehavior } from '../composables/useViewport'
import type { CanvasHost } from '../host'
import CanvasMenu from './CanvasMenu.vue'
import CanvasOverlay from './CanvasOverlay.vue'
import CanvasScene from './CanvasScene.vue'

const props = withDefaults(defineProps<{
	/** Nothing can be changed; selecting, panning and zooming still work. */
	readonly?: boolean
	/** Moved and resized nodes snap to the grid (on an axis that didn't snap to another node). */
	snapToGrid?: boolean
	/** Moved and resized nodes snap to other nodes' edges and centres. */
	snapToObjects?: boolean
	/** What a plain mouse wheel does; the other happens with Mod or Space held. */
	wheelBehavior?: WheelBehavior
	/** Names above file and link cards. */
	cardLabels?: CardLabels
	/** How much further out (log2 zoom units) card content stays before placeholders show. */
	zoomBreakpoint?: number
	/** What the canvas can ask of the app: files to pick, links to offer. */
	host?: CanvasHost
}>(), { readonly: false, snapToGrid: true, snapToObjects: true, wheelBehavior: 'pan', cardLabels: 'always', zoomBreakpoint: 0, host: undefined })

/**
 * The document. A new one replaces it (and clears undo); edits are emitted as new objects, never by changing the
 * one given.
 */
const canvasModel = defineModel<JSONCanvas>({ required: true })
/** Where the view is; set when it comes to rest. Without one at mount, the view fits the canvas. */
const viewportModel = defineModel<Viewport>('viewport')

const el = useTemplateRef<HTMLDivElement>('el')
const editor = useCanvasEditor(el, {
	canvas: () => canvasModel.value,
	onChange: (doc) => {
		canvasModel.value = doc
	},
	wheelBehavior: () => props.wheelBehavior,
	zoomBreakpointOffset: () => props.zoomBreakpoint,
	initialViewport: () => viewportModel.value,
	onViewportSettled: (v) => {
		viewportModel.value = v
	},
})
const interaction = useCanvasInteraction(el, editor, {
	readonly: () => props.readonly,
	snapToGrid: () => props.snapToGrid,
	snapToObjects: () => props.snapToObjects,
	host: () => props.host,
})
const { visibleNodes, visibleEdges, zoomedOut, contentHidden, selected } = editor
const { view, size, scale, settledZoom, spaceHeld, panning, moving } = editor.viewport
const { handlesFor, selectionBox, marquee, guides, ghosts, connection, labelEditing, menu } = interaction

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
/** The drag-select rectangle on screen, so its border stays 2 px at any zoom. */
const marqueeStyle = computed(() => {
	const m = marquee.value
	if (!m) return
	const s = scale.value
	return {
		left: `${(m.minX - view.x) * s + size.width / 2}px`,
		top: `${(m.minY - view.y) * s + size.height / 2}px`,
		width: `${(m.maxX - m.minX) * s}px`,
		height: `${(m.maxY - m.minY) * s}px`,
	}
})

function onPointerDown(e: PointerEvent) {
	if (!(e.target as Element).closest('[contenteditable]')) el.value?.focus({ preventScroll: true })
	interaction.onPointerDown(e)
}

function onKeyDown(e: KeyboardEvent) {
	editor.viewport.onKeyDown(e)
	interaction.onKeyDown(e)
}

defineExpose({
	/** The document as shown. */
	canvas: editor.canvas,
	/** What in the document can't be shown as the spec intends. */
	issues: editor.issues,
	viewport: view,
	/** Keys of the selected nodes and edges (their ids, unless an id is shared). */
	selected,
	select: editor.select,
	undo: editor.undo,
	redo: editor.redo,
	canUndo: editor.canUndo,
	canRedo: editor.canRedo,
	zoomToFit: editor.zoomToFit,
	zoomToSelection: editor.zoomToSelection,
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
		:class="{ 'jc-zoomed-out': zoomedOut, 'jc-space': spaceHeld, 'jc-panning': panning, 'jc-moving': moving, 'jc-readonly': readonly, 'jc-connecting': !!connection }"
		:style="{ '--jc-zoom-multiplier': zoomMultiplier }"
		tabindex="-1"
		@wheel="editor.viewport.onWheel"
		@pointerdown="onPointerDown"
		@pointermove="interaction.onPointerMove"
		@pointerleave="interaction.onPointerLeave"
		@contextmenu.capture="editor.viewport.onContextMenu"
		@contextmenu="interaction.onContextMenu"
		@keydown="onKeyDown"
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
			<CanvasScene
				:nodes="visibleNodes"
				:edges="visibleEdges"
				:selected="selected"
				:selection-box="selectionBox"
				:label-editing="labelEditing"
				:content-hidden="contentHidden"
				:card-labels="cardLabels"
				@label-done="interaction.finishLabel"
			/>
			<CanvasOverlay :handles-for="handlesFor" :connection="connection" :ghosts="ghosts" :guides="guides" :scale="scale" />
		</div>
		<div v-if="marqueeStyle" class="jc-marquee" :style="marqueeStyle" />
		<CanvasMenu :menu="menu" @close="interaction.closeMenu" />
	</div>
</template>
