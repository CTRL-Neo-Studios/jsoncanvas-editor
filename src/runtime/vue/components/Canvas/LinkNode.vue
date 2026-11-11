<script setup lang="ts">
import UIcon from '@nuxt/ui/components/Icon.vue'
import type { JSONCanvasLinkNode } from '../../../core/types'

defineProps<{
  node: JSONCanvasLinkNode
  isSelected: boolean
}>()
</script>

<template>
  <div class="bg-default rounded-lg p-2 shadow-lg">
    <a :href="node.url" target="_blank" rel="noopener noreferrer" class="flex items-center gap-2">
      <UIcon name="i-lucide-link" class="w-6 h-6" />
      <span>{{ node.url }}</span>
    </a>
  </div>
</template>
