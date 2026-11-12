<script setup lang="ts">
import { ARROW_POINTS, RESIZE_HANDLES, SIDES, type BBox, type SnapGuide } from '../../core'
import type { SceneNode } from '../composables/useCanvasEditor'
import type { DraggedEdge } from '../composables/useCanvasInteraction'
import { boxStyle } from '../utils/style'

/** What sits above the nodes while editing: a node's handles, an edge being dragged, clone ghosts and snap guides. */
defineProps<{
	handlesFor?: SceneNode
	connection?: DraggedEdge
	ghosts: BBox[]
	guides: SnapGuide[]
	/** For the guides' dots, which keep a fixed size on screen. */
	scale: number
}>()

const isSide = (h: string) => (SIDES as readonly string[]).includes(h)
</script>

<template>
	<div v-if="handlesFor" class="jc-handles" :style="boxStyle(handlesFor.box)">
		<div v-for="h in RESIZE_HANDLES" :key="h" class="jc-handle" :data-resize="h" :data-owner="handlesFor.key">
			<!-- A side's connection point: drag from it to draw an edge. -->
			<div v-if="isSide(h)" class="jc-connect" :data-connect="h" />
		</div>
	</div>
	<svg v-if="connection" class="jc-edges jc-dragged-edge" :class="connection.color.class" :style="connection.color.style">
		<path class="jc-edge-line" :d="connection.shape.path" />
		<g v-for="(a, i) in connection.shape.arrows" :key="i" :transform="`translate(${a.point.x} ${a.point.y}) rotate(${a.rotation})`">
			<polygon class="jc-edge-arrow" :points="ARROW_POINTS" />
		</g>
	</svg>
	<div v-for="(g, i) in ghosts" :key="i" class="jc-ghost" :style="boxStyle(g)" />
	<svg v-if="guides.length" class="jc-guides">
		<g v-for="(g, i) in guides" :key="i">
			<line :x1="g.from.x" :y1="g.from.y" :x2="g.to.x" :y2="g.to.y" />
			<circle v-for="(p, j) in g.points" :key="j" :cx="p.x" :cy="p.y" :r="4 / scale" />
		</g>
	</svg>
</template>
