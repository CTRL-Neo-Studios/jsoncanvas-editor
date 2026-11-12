<script setup lang="ts">
import { RESIZE_HANDLES, type BBox, type SnapGuide } from '../../core'
import type { SceneNode } from '../composables/useCanvasEditor'
import { boxStyle } from '../utils/style'

/** What sits above the nodes while editing: a node's resize handles, clone ghosts and snap guides. */
defineProps<{
	handlesFor?: SceneNode
	ghosts: BBox[]
	guides: SnapGuide[]
	/** For the guides' dots, which keep a fixed size on screen. */
	scale: number
}>()
</script>

<template>
	<div v-if="handlesFor" class="jc-handles" :style="boxStyle(handlesFor.box)">
		<div v-for="h in RESIZE_HANDLES" :key="h" class="jc-handle" :data-resize="h" :data-owner="handlesFor.key" />
	</div>
	<div v-for="(g, i) in ghosts" :key="i" class="jc-ghost" :style="boxStyle(g)" />
	<svg v-if="guides.length" class="jc-guides">
		<g v-for="(g, i) in guides" :key="i">
			<line :x1="g.from.x" :y1="g.from.y" :x2="g.to.x" :y2="g.to.y" />
			<circle v-for="(p, j) in g.points" :key="j" :cx="p.x" :cy="p.y" :r="4 / scale" />
		</g>
	</svg>
</template>
