<script setup lang="ts">
import { computed, inject } from 'vue'
import UIcon from '@nuxt/ui/components/Icon.vue'
import { embedUrl, type JSONCanvasLinkNode } from '../../core'
import { CANVAS_CONTENT } from '../composables/useCanvasContent'
import type { SceneNode } from '../composables/useCanvasEditor'

/** A web page in a sandboxed frame; YouTube and X posts as their embeds. Only http(s) loads. */
const props = defineProps<{ item: SceneNode }>()
const content = inject(CANVAS_CONTENT)!
const node = computed(() => props.item.node as JSONCanvasLinkNode)
const src = computed(() => embedUrl(node.value.url, { dark: document.documentElement.classList.contains('dark') }))
</script>

<template>
	<div v-if="src" class="jc-node-content">
		<iframe
			:key="content.interaction.reloads.value.get(item.key) ?? 0"
			class="jc-frame"
			:src="src"
			sandbox="allow-forms allow-presentation allow-same-origin allow-scripts allow-modals"
			allow="fullscreen"
		/>
	</div>
	<div v-else class="jc-node-content jc-card">
		<UIcon name="i-lucide-link" class="jc-icon" />
		<span class="jc-card-name">{{ node.url }}</span>
	</div>
</template>
