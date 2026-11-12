<script setup lang="ts">
import { computed } from 'vue'
import { ARROW_POINTS, RESIZE_HANDLES, type BBox, type EdgeGeometry } from '../../core'
import type { CardLabels, MovingSet, SceneEdge, SceneNode } from '../composables/useCanvasEditor'
import type { LabelEditing } from '../composables/useCanvasInteraction'
import type { ColorBinding } from '../utils/color'
import { boxStyle } from '../utils/style'
import CanvasEdgeLabel from './CanvasEdgeLabel.vue'
import CanvasNode from './CanvasNode.vue'

/** Everything in the world layer. Re-renders only when what's visible changes, not on every frame of a pan. */
const props = defineProps<{
	nodes: SceneNode[]
	edges: SceneEdge[]
	selected: ReadonlySet<string>
	/** Around a multi-selection; below the nodes, so they stay clickable. */
	selectionBox?: BBox
	labelEditing?: LabelEditing
	/** The text card being edited. */
	editing?: string
	contentHidden: boolean
	cardLabels: CardLabels
	/** Drawn for an image (see `CanvasNode`). */
	exporting?: boolean
	/** A move in progress: these items are drawn at the world's `--jc-move-x`/`-y` offset. */
	moving?: MovingSet
	/** See `CanvasNode`. */
	minFrameWidth?: number
	/**
	 * Draw unselected edges a few paths at a time (one per color) instead of one element each: thousands of
	 * edges zoomed out. With the arrows' size multiplier (`--jc-zoom-multiplier`), which their paths include.
	 */
	batched?: { multiplier: number }
}>()
const emit = defineEmits<{ labelDone: [key: string, text: string] }>()

const labelled = computed(() => props.edges.filter(e => e.edge.label || e.key === props.labelEditing?.key))

/** Arrowheads as path data: the polygon scaled by `m` about its tip, turned, and placed. */
function arrowPath(arrows: EdgeGeometry['arrows'], m: number): string {
	let d = ''
	for (const { point, rotation } of arrows) {
		const r = (rotation * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r)
		const at = (x: number, y: number) => `${point.x + (x * cos - y * sin) * m} ${point.y + (x * sin + y * cos) * m}`
		d += `M${at(0, 0)} L${at(6.5, 10.4)} L${at(-6.5, 10.4)} Z `
	}
	return d
}

interface Batch {
	key: string
	color: ColorBinding
	moved: boolean
	line: string
	arrows: string
}

const batches = computed(() => {
	const b = props.batched
	if (!b) return
	const groups = new Map<string, Batch>()
	const single: SceneEdge[] = []
	let hit = ''
	for (const e of props.edges) {
		// Selected edges keep their own elements, for their highlight.
		if (props.selected.has(e.key)) {
			single.push(e)
			continue
		}
		const moved = !!props.moving?.edges.has(e.key)
		const key = `${moved ? 'm' : ''}${typeof e.edge.color === 'string' ? e.edge.color : ''}`
		let group = groups.get(key)
		if (!group) groups.set(key, group = { key, color: e.color, moved, line: '', arrows: '' })
		group.line += `${e.shape.path} `
		group.arrows += arrowPath(e.shape.arrows, b.multiplier)
		if (!moved) hit += `${e.shape.path} `
	}
	return { groups: [...groups.values()], single, hit }
})
const ownEdges = computed(() => batches.value?.single ?? props.edges)
</script>

<template>
	<svg class="jc-edges">
		<template v-if="batches">
			<!-- One band to catch the pointer; which edge it hit is worked out from the curves. -->
			<path class="jc-edge-hit" data-edge-batch :d="batches.hit" />
			<path
				v-for="g in batches.groups"
				:key="g.key"
				class="jc-edge-line"
				:class="[g.color.class, { 'jc-moved': g.moved }]"
				:style="g.color.style"
				:d="g.line"
			/>
		</template>
		<g
			v-for="e in ownEdges"
			:key="e.key"
			class="jc-edge"
			:class="[e.color.class, { 'jc-selected': selected.has(e.key), 'jc-moved': moving?.edges.has(e.key) }]"
			:style="e.color.style"
			:data-id="e.edge.id"
			:data-edge="e.key"
		>
			<path class="jc-edge-hit" :d="e.shape.path" />
			<path class="jc-edge-line" :d="e.shape.path" />
		</g>
	</svg>
	<!-- Arrowheads in a layer of their own, above every line. -->
	<svg class="jc-edges">
		<template v-if="batches">
			<path
				v-for="g in batches.groups"
				:key="g.key"
				class="jc-edge-arrow jc-edge-arrows"
				:class="[g.color.class, { 'jc-moved': g.moved }]"
				:style="g.color.style"
				:d="g.arrows"
			/>
		</template>
		<template v-for="e in ownEdges" :key="e.key">
			<g
				v-for="(a, i) in e.shape.arrows"
				:key="i"
				:class="[e.color.class, { 'jc-moved': moving?.edges.has(e.key) }]"
				:style="e.color.style"
				:transform="`translate(${a.point.x} ${a.point.y}) rotate(${a.rotation})`"
			>
				<polygon class="jc-edge-arrow" :points="ARROW_POINTS" />
			</g>
		</template>
	</svg>
	<div v-if="selectionBox" class="jc-selection" :class="{ 'jc-moved': moving }" :style="boxStyle(selectionBox)">
		<div v-for="h in RESIZE_HANDLES" :key="h" class="jc-handle" :data-resize="h" />
	</div>
	<CanvasNode
		v-for="n in nodes"
		:key="n.key"
		:item="n"
		:selected="selected.has(n.key)"
		:focused="selected.size === 1 && selected.has(n.key)"
		:editing="editing === n.key"
		:label-editing="labelEditing?.key === n.key ? labelEditing : undefined"
		:content-hidden="contentHidden"
		:card-labels="cardLabels"
		:exporting="exporting"
		:moved="moving?.nodes.has(n.key)"
		:min-frame-width="minFrameWidth"
	/>
	<CanvasEdgeLabel
		v-for="e in labelled"
		:key="e.key"
		:item="e"
		:class="{ 'jc-moved': moving?.edges.has(e.key) }"
		:editing="labelEditing?.key === e.key ? labelEditing : undefined"
		@done="text => emit('labelDone', e.key, text)"
	/>
</template>
