<script setup lang="ts">
import type { CanvasMinimap } from '../../core'
import { colorBinding } from '../utils/color'

/** Another canvas drawn small inside a file card. */
defineProps<{ minimap: CanvasMinimap }>()
</script>

<template>
	<svg class="jc-minimap" :viewBox="minimap.viewBox" :style="{ '--jc-minimap-stroke': minimap.strokeWidth }">
		<rect
			v-for="(r, i) in minimap.groups"
			:key="`g${i}`"
			v-bind="colorBinding(r.color)"
			class="jc-minimap-group"
			:x="r.x"
			:y="r.y"
			:width="r.width"
			:height="r.height"
			rx="20"
		/>
		<path v-for="(e, i) in minimap.edges" :key="`e${i}`" v-bind="colorBinding(e.color)" class="jc-minimap-edge" :d="e.path" />
		<rect
			v-for="(r, i) in minimap.nodes"
			:key="`n${i}`"
			v-bind="colorBinding(r.color)"
			class="jc-minimap-node"
			:x="r.x"
			:y="r.y"
			:width="r.width"
			:height="r.height"
			rx="20"
		/>
	</svg>
</template>
