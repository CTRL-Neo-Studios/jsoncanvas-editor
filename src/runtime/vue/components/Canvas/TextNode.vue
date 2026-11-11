<script setup lang="ts">
import type { JSONCanvasTextNode } from '../../../core/types'

defineProps<{
  node: JSONCanvasTextNode
  isSelected: boolean
}>()
</script>

<template>
  <div class="bg-default rounded-lg p-2 shadow-lg">
    <div class="prose dark:prose-invert">
      {{ node.text }}
    </div>
  </div>
</template>
