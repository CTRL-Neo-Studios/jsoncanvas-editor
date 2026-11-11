<script setup lang="ts">
import UIcon from '@nuxt/ui/components/Icon.vue'
import type { JSONCanvasFileNode } from '../../../core/types'

defineProps<{
  node: JSONCanvasFileNode
  isSelected: boolean
}>()
</script>

<template>
  <div class="bg-default rounded-lg p-2 shadow-lg">
    <div class="flex items-center gap-2">
      <UIcon name="i-lucide-file" class="w-6 h-6" />
      <span>{{ node.file }}</span>
    </div>
  </div>
</template>
