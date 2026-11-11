<script setup lang="ts">
import type { JSONCanvasGroupNode } from '../../../core/types'

defineProps<{
  node: JSONCanvasGroupNode
  isSelected: boolean
}>()
</script>

<template>
  <div
    class="relative w-full h-full shadow-lg border border-default rounded-md"
    :style="{ 
      backgroundColor: node.background ? 'transparent' : node.color,
      backgroundImage: node.background ? `url(${node.background})` : 'none',
      backgroundSize: node.backgroundStyle === 'cover' ? 'cover' : (node.backgroundStyle === 'ratio' ? 'contain' : 'auto'),
      backgroundRepeat: node.backgroundStyle === 'repeat' ? 'repeat' : 'no-repeat',
    }"
  >
    <div v-if="node.label" class="absolute top-0 left-0 w-fit pt-1 text-xs p-1 px-1.5 text-muted">
      {{ node.label }}
    </div>
  </div>
</template>

<style scoped>
</style>