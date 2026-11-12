<script setup lang="ts">
import { computed } from 'vue'
import { ARROW_POINTS, RESIZE_HANDLES, type BBox } from '../../core'
import type { CardLabels, SceneEdge, SceneNode } from '../composables/useCanvasEditor'
import { boxStyle } from '../utils/style'
import CanvasNode from './CanvasNode.vue'

/** Everything in the world layer. Re-renders only when what's visible changes, not on every frame of a pan. */
const props = defineProps<{
	nodes: SceneNode[]
	edges: SceneEdge[]
	selected: ReadonlySet<string>
	/** Around a multi-selection; below the nodes, so they stay clickable. */
	selectionBox?: BBox
	contentHidden: boolean
	cardLabels: CardLabels
}>()

const labelled = computed(() => props.edges.filter(e => e.edge.label))
</script>

<template>
	<svg class="jc-edges">
		<g v-for="e in edges" :key="e.key" class="jc-edge" :class="e.color.class" :style="e.color.style" :data-id="e.edge.id">
			<path class="jc-edge-hit" :d="e.shape.path" />
			<path class="jc-edge-line" :d="e.shape.path" />
		</g>
	</svg>
	<!-- Arrowheads in a layer of their own, above every line. -->
	<svg class="jc-edges">
		<template v-for="e in edges" :key="e.key">
			<g
				v-for="(a, i) in e.shape.arrows"
				:key="i"
				:class="e.color.class"
				:style="e.color.style"
				:transform="`translate(${a.point.x} ${a.point.y}) rotate(${a.rotation})`"
			>
				<polygon class="jc-edge-arrow" :points="ARROW_POINTS" />
			</g>
		</template>
	</svg>
	<div v-if="selectionBox" class="jc-selection" :style="boxStyle(selectionBox)">
		<div v-for="h in RESIZE_HANDLES" :key="h" class="jc-handle" :data-resize="h" />
	</div>
	<CanvasNode
		v-for="n in nodes"
		:key="n.key"
		:item="n"
		:selected="selected.has(n.key)"
		:content-hidden="contentHidden"
		:card-labels="cardLabels"
	/>
	<div
		v-for="e in labelled"
		:key="e.key"
		class="jc-edge-label"
		:class="e.color.class"
		:style="[e.color.style, { transform: `translate(${e.shape.label.x}px, ${e.shape.label.y}px)` }]"
	>
		<div class="jc-edge-label-text">
			{{ e.edge.label }}
		</div>
	</div>
</template>
