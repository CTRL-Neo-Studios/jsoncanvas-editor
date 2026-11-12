<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, provide, ref, useId, useTemplateRef, watch } from 'vue'
import { gridSpacing, intersectsBBox, type JSONCanvas, type Viewport } from '../../core'
import { useCanvasActions, type CanvasMenuEvent, type CardTemplate, type ModDragBehavior } from '../composables/useCanvasActions'
import { CANVAS_CONTENT, useCanvasContent, type CanvasSlots } from '../composables/useCanvasContent'
import { useCanvasEditor, type CardLabels } from '../composables/useCanvasEditor'
import { useCanvasExport } from '../composables/useCanvasExport'
import { useCanvasInteraction } from '../composables/useCanvasInteraction'
import type { WheelBehavior } from '../composables/useViewport'
import type { CanvasHost, FileRenderers, NodeRenderers } from '../host'
import { format, MESSAGES, type CanvasMessages } from '../messages'
import { IS_MAC } from '../utils/platform'
import CanvasCardBar from './CanvasCardBar.vue'
import CanvasControls from './CanvasControls.vue'
import CanvasMenu from './CanvasMenu.vue'
import CanvasOverlay from './CanvasOverlay.vue'
import CanvasScene from './CanvasScene.vue'
import CanvasToolbar from './CanvasToolbar.vue'

// Dialogs load when first shown, so their dependencies aren't needed until then.
const CanvasPrompt = defineAsyncComponent(() => import('./CanvasPrompt.vue'))
const CanvasHelp = defineAsyncComponent(() => import('./CanvasHelp.vue'))
const CanvasExport = defineAsyncComponent(() => import('./CanvasExport.vue'))

const props = withDefaults(defineProps<{
	/** What a plain mouse wheel does; the other happens with Mod or Space held. */
	wheelBehavior?: WheelBehavior
	/** Names above file and link cards. */
	cardLabels?: CardLabels
	/** How much further out (log2 zoom units) card content stays before placeholders show. */
	zoomBreakpoint?: number
	/** What the canvas can ask of the app: files, their contents, links, and where to open them. */
	host?: CanvasHost
	/** Components that draw file cards, by extension; they replace the built-in ones. */
	fileRenderers?: FileRenderers
	/** Cards by node type: replace a built-in card (`text`, `file`, `link`, `group`) or add a new type. */
	nodeRenderers?: NodeRenderers
	/** Custom cards offered in the bottom bar and the add menus. */
	cardTemplates?: CardTemplate[]
	/** What Mod+drag on empty canvas creates: a menu of choices, or one kind directly. */
	modDragBehavior?: ModDragBehavior
	/** Replacements for the canvas's strings (see `CanvasMessages`). */
	messages?: Partial<CanvasMessages>
	/** The floating toolbar above the selection. */
	toolbar?: boolean
	/** The controls at the right. */
	controls?: boolean
	/** The bar of cards to add at the bottom. */
	cardBar?: boolean
}>(), {
	wheelBehavior: 'pan', cardLabels: 'always', zoomBreakpoint: 0, host: undefined, fileRenderers: undefined,
	nodeRenderers: undefined, cardTemplates: () => [], modDragBehavior: 'menu', messages: undefined,
	toolbar: true, controls: true, cardBar: true,
})
const emit = defineEmits<{
	/** A context menu is about to open; add groups of items to `items` to extend it. */
	menu: [event: CanvasMenuEvent]
}>()
const slots = defineSlots<CanvasSlots>()

/**
 * The document. A new one replaces it (and clears undo); edits are emitted as new objects, never by changing the
 * one given.
 */
const canvasModel = defineModel<JSONCanvas>({ required: true })
/** Where the view is; set when it comes to rest. Without one at mount, the view fits the canvas. */
const viewportModel = defineModel<Viewport>('viewport')
/** Nothing can be changed; selecting, panning and zooming still work. Also toggled from the settings. */
const readonly = defineModel<boolean>('readonly', { default: false })
/** Moved and resized nodes snap to the grid (on an axis that didn't snap to another node). */
const snapToGrid = defineModel<boolean>('snapToGrid', { default: true })
/** Moved and resized nodes snap to other nodes' edges and centres. */
const snapToObjects = defineModel<boolean>('snapToObjects', { default: true })

/** Node types with a custom card, from `nodeRenderers` and `#node-<type>` slots. */
const customTypes = computed(() => new Set([
	...Object.keys(props.nodeRenderers ?? {}),
	...Object.keys(slots).flatMap(name => (name.startsWith('node-') ? [name.slice(5)] : [])),
]))
const messages = computed((): CanvasMessages => ({ ...MESSAGES, ...props.messages }))

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
	readonly: () => readonly.value,
	snapToGrid: () => snapToGrid.value,
	snapToObjects: () => snapToObjects.value,
	host: () => props.host,
	customTypes: () => customTypes.value,
	messages: () => messages.value,
	actions: () => actions,
})
const settings = { readonly, snapToGrid, snapToObjects }
const actions = useCanvasActions(editor, interaction, {
	settings,
	host: () => props.host,
	messages: () => messages.value,
	customTypes: () => customTypes.value,
	cardTemplates: () => props.cardTemplates,
	modDragBehavior: () => props.modDragBehavior,
	onMenu: e => emit('menu', e),
})
const content = useCanvasContent(editor, interaction, {
	host: () => props.host,
	fileRenderers: () => props.fileRenderers,
	nodeRenderers: () => props.nodeRenderers,
	slots,
	readonly: () => readonly.value,
	messages: () => messages.value,
})
provide(CANVAS_CONTENT, content)
// Another host may answer differently.
watch(() => props.host, () => content.refreshFiles())
const { visibleNodes, visibleEdges, zoomedOut, contentHidden, selected, scene } = editor
const { view, size, scale, settledZoom, spaceHeld, panning, moving } = editor.viewport
const { handlesFor, selectionBox, marquee, guides, ghosts, connection, labelEditing, menu, editing, prompt } = interaction

const helpOpen = ref(false)
const openHelp = () => (helpOpen.value = true)
const exportOpen = ref(false)
/** Opens the export dialog (it saves through `host.saveImage`). */
const openExport = () => (exportOpen.value = true)
const exporter = useCanvasExport(editor, content, () => exportEl.value)
const exportEl = useTemplateRef<HTMLDivElement>('exportEl')
/** What an export draws: everything in its frame, regardless of the view. */
const exportScene = computed(() => {
	const box = exporter.frame.value?.box
	return box && {
		box,
		nodes: scene.value.nodes.filter(n => intersectsBBox(n.box, box)),
		edges: scene.value.edges.filter(e => intersectsBBox(e.bounds, box)),
		grid: gridSpacing(0),
	}
})
const NO_SELECTION: ReadonlySet<string> = new Set()
const ZOOM_STEP = 0.5

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

function onKeyDown(e: KeyboardEvent) {
	editor.viewport.onKeyDown(e)
	interaction.onKeyDown(e)
}

// Clipboard events go to the document (to the focused element, or the body, by browser), so they're taken while
// the canvas itself has focus. Text being edited has the focus, so it copies and pastes as text.
function onClipboard(e: ClipboardEvent) {
	if (document.activeElement !== el.value || !e.clipboardData) return
	const data = e.clipboardData
	if (e.type === 'copy' ? actions.copy(data) : e.type === 'cut' ? actions.cut(data) : actions.paste(data)) e.preventDefault()
}
const CLIPBOARD_EVENTS = ['copy', 'cut', 'paste'] as const
onMounted(() => CLIPBOARD_EVENTS.forEach(t => document.addEventListener(t, onClipboard)))
onBeforeUnmount(() => CLIPBOARD_EVENTS.forEach(t => document.removeEventListener(t, onClipboard)))

/** A drop into a text being edited is the text's. */
const intoText = (e: DragEvent) => !!(e.target as Element).closest('input, textarea, [contenteditable]')

function onDragOver(e: DragEvent) {
	if (intoText(e)) return
	// Taken in read-only too, so a dropped file never replaces the page.
	e.preventDefault()
	if (e.dataTransfer) e.dataTransfer.dropEffect = readonly.value ? 'none' : 'copy'
}

function onDrop(e: DragEvent) {
	if (intoText(e) || !e.dataTransfer) return
	e.preventDefault()
	actions.paste(e.dataTransfer, editor.viewport.screenToWorld(e))
}

defineExpose({
	/** The document as shown. */
	canvas: editor.canvas,
	/** What in the document can't be shown as the spec intends (nodes of a type with a custom card aside). */
	issues: computed(() => editor.issues.value.filter(i =>
		!(i.kind === 'unsupported-node' && i.reason === 'unknown-type' && customTypes.value.has(i.type!)))),
	viewport: view,
	/** Keys of the selected nodes and edges (their ids, unless an id is shared). */
	selected,
	select: editor.select,
	undo: editor.undo,
	redo: editor.redo,
	canUndo: editor.canUndo,
	canRedo: editor.canRedo,
	/** Adds a node (any type, e.g. one with a custom card) on top and selects it; returns its id. */
	addNode: interaction.addNode,
	/** What the toolbar and menus do, for custom chrome. */
	actions,
	zoomToFit: editor.zoomToFit,
	zoomToSelection: editor.zoomToSelection,
	/** Forgets loaded files (all, or those at `paths`), so cards showing them load them again. */
	refreshFiles: content.refreshFiles,
	zoomToBBox: editor.viewport.zoomToBBox,
	zoomBy: editor.viewport.zoomBy,
	setViewport: editor.viewport.setViewport,
	screenToWorld: editor.viewport.screenToWorld,
	openHelp,
	/**
	 * The canvas (or the view) as a PNG: `frame` `'full'` (default) or `'viewport'`, `scale` (image px per world unit),
	 * `privacy`, `padding`, `watermark`.
	 */
	exportPng: exporter.exportPng,
	openExport,
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
		@pointerdown="interaction.onPointerDown"
		@dblclick="interaction.onDoubleClick"
		@pointermove="interaction.onPointerMove"
		@pointerleave="interaction.onPointerLeave"
		@contextmenu.capture="editor.viewport.onContextMenu"
		@contextmenu="interaction.onContextMenu"
		@keydown="onKeyDown"
		@keyup="editor.viewport.onKeyUp"
		@blur="spaceHeld = false"
		@dragover="onDragOver"
		@drop="onDrop"
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
				:editing="editing"
				:content-hidden="contentHidden"
				:card-labels="cardLabels"
				@label-done="interaction.finishLabel"
			/>
			<CanvasOverlay :handles-for="handlesFor" :connection="connection" :ghosts="ghosts" :guides="guides" :scale="scale" />
		</div>
		<div v-if="marqueeStyle" class="jc-marquee" :style="marqueeStyle" />
		<div v-if="!scene.nodes.length" class="jc-empty">
			<slot name="empty">
				<p v-if="!readonly">
					{{ messages.emptyDragFromBelow }}
				</p>
				<p>{{ messages.emptyPan }}</p>
				<p>{{ format(messages.emptyZoom, { mod: IS_MAC ? '⌘' : 'Ctrl' }) }}</p>
			</slot>
		</div>
		<template v-if="toolbar">
			<slot name="toolbar" :actions="actions">
				<CanvasToolbar :actions="actions" :size="size" />
			</slot>
		</template>
		<template v-if="controls">
			<slot name="controls" :settings="settings" :actions="actions" :open-help="openHelp" :open-export="openExport">
				<CanvasControls
					:settings="settings"
					:can-undo="editor.canUndo.value"
					:can-redo="editor.canRedo.value"
					:can-export="!!host?.saveImage"
					@zoom-in="editor.viewport.zoomBy(ZOOM_STEP)"
					@zoom-out="editor.viewport.zoomBy(-ZOOM_STEP)"
					@reset-zoom="editor.viewport.zoomBy(-view.zoom)"
					@zoom-to-fit="editor.zoomToFit()"
					@undo="editor.undo"
					@redo="editor.redo"
					@help="openHelp"
					@export="openExport"
					@setting="(key, value) => (settings[key].value = value)"
				/>
			</slot>
		</template>
		<template v-if="cardBar && !readonly">
			<slot name="card-bar" :actions="actions" :templates="cardTemplates">
				<CanvasCardBar :actions="actions" :templates="cardTemplates" :center="() => ({ x: view.x, y: view.y })" />
			</slot>
		</template>
		<CanvasMenu :menu="menu" @close="interaction.closeMenu" />
		<CanvasPrompt v-if="prompt" :prompt="prompt" @close="interaction.prompt.value = undefined" />
		<CanvasHelp v-if="helpOpen" :wheel-behavior="wheelBehavior" @close="helpOpen = false" />
		<CanvasExport v-if="exportOpen" :exporter="exporter" :has-watermark="!!slots.watermark" @close="exportOpen = false" />
		<!-- An export's copy of the scene: laid out, so cards load and measure, but never seen. -->
		<div v-if="exportScene" class="jc-export-host">
			<div
				ref="exportEl"
				class="jc-export"
				:style="{ width: `${exportScene.box.maxX - exportScene.box.minX}px`, height: `${exportScene.box.maxY - exportScene.box.minY}px` }"
			>
				<svg class="jc-background">
					<defs>
						<pattern :id="`${patternId}-export`" patternUnits="userSpaceOnUse" :x="-exportScene.box.minX" :y="-exportScene.box.minY" :width="exportScene.grid" :height="exportScene.grid">
							<circle cx="0.7" cy="0.7" r="0.7" />
						</pattern>
					</defs>
					<rect width="100%" height="100%" :fill="`url(#${patternId}-export)`" />
				</svg>
				<div class="jc-world" :style="{ transform: `translate(${-exportScene.box.minX}px, ${-exportScene.box.minY}px)` }">
					<CanvasScene
						:nodes="exportScene.nodes"
						:edges="exportScene.edges"
						:selected="NO_SELECTION"
						:content-hidden="false"
						:card-labels="cardLabels"
						exporting
					/>
				</div>
				<div v-if="exporter.frame.value?.watermark && slots.watermark" class="jc-watermark">
					<slot name="watermark" />
				</div>
			</div>
		</div>
	</div>
</template>
