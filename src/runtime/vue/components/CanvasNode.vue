<script setup lang="ts">
import { computed } from 'vue'
import UIcon from '@nuxt/ui/components/Icon.vue'
import { fileName } from '../../core'
import type { CardLabels, SceneNode } from '../composables/useCanvasEditor'

const props = defineProps<{
	item: SceneNode
	/** Zoomed out past the breakpoint: show a placeholder instead of the content. */
	contentHidden: boolean
	cardLabels: CardLabels
}>()

const style = computed(() => {
	const { box, color } = props.item
	return [{ transform: `translate(${box.minX}px, ${box.minY}px)`, width: `${box.maxX - box.minX}px`, height: `${box.maxY - box.minY}px` }, color.style]
})

/** What the card shows, per kind. */
const content = computed(() => {
	const n = props.item.node
	switch (props.item.kind) {
		case 'text': return { text: n.text as string }
		case 'file': return { icon: 'i-lucide-file', name: fileName(n.file as string) }
		case 'link': return { icon: 'i-lucide-link', name: n.url as string }
		case 'group': return { groupLabel: n.label as string | undefined }
		default: return { type: typeof n.type === 'string' ? n.type : undefined }
	}
})
</script>

<template>
	<div class="jc-node" :class="[`jc-node-${item.kind}`, item.color.class]" :style="style" :data-id="item.node.id">
		<div v-if="item.label && cardLabels !== 'never'" class="jc-node-label" :class="{ 'jc-hover-label': cardLabels === 'hover' }">
			{{ item.label }}
		</div>
		<div v-if="content.groupLabel" class="jc-group-label">
			{{ content.groupLabel }}
		</div>
		<div class="jc-node-container">
			<div v-if="item.kind === 'group'" class="jc-node-content" />
			<div v-else-if="item.kind === 'unsupported'" class="jc-node-content jc-unsupported">
				<UIcon name="i-lucide-triangle-alert" class="jc-icon" />
				<span>Unsupported node{{ content.type ? `: ${content.type}` : '' }}</span>
			</div>
			<div v-else-if="contentHidden" class="jc-placeholder">
				<UIcon v-if="item.kind === 'text'" name="i-lucide-align-left" class="jc-placeholder-icon" />
				<template v-else>
					{{ item.label }}
				</template>
			</div>
			<div v-else-if="item.kind === 'text'" class="jc-node-content jc-text">
				{{ content.text }}
			</div>
			<div v-else class="jc-node-content jc-card">
				<UIcon :name="content.icon!" class="jc-icon" />
				<span class="jc-card-name">{{ content.name }}</span>
			</div>
		</div>
	</div>
</template>
