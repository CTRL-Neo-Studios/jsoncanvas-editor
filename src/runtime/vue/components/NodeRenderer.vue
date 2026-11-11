<script setup lang="ts">
import { ref } from 'vue'
import type { JSONCanvasNode } from '../../core/types'
import TextNode from './Canvas/TextNode.vue'
import FileNode from './Canvas/FileNode.vue'
import LinkNode from './Canvas/LinkNode.vue'
import GroupNode from './Canvas/GroupNode.vue'

const props = defineProps<{
  node: JSONCanvasNode
  isSelected: boolean
}>()

const emit = defineEmits<{
  'interaction-start': [event: PointerEvent]
}>()

const cursor = ref('cursor-grab')

function updateCursor(event: PointerEvent) {
  if (!props.isSelected) {
    cursor.value = 'cursor-grab'
    return
  }
  const target = event.target as HTMLElement
  const rect = target.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top

  const threshold = 8
  const onTop = y < threshold
  const onBottom = y > rect.height - threshold
  const onLeft = x < threshold
  const onRight = x > rect.width - threshold

  if (onTop && onLeft) cursor.value = 'cursor-nwse-resize'
  else if (onTop && onRight) cursor.value = 'cursor-nesw-resize'
  else if (onBottom && onLeft) cursor.value = 'cursor-nesw-resize'
  else if (onBottom && onRight) cursor.value = 'cursor-nwse-resize'
  else if (onTop) cursor.value = 'cursor-ns-resize'
  else if (onBottom) cursor.value = 'cursor-ns-resize'
  else if (onLeft) cursor.value = 'cursor-ew-resize'
  else if (onRight) cursor.value = 'cursor-ew-resize'
  else cursor.value = 'cursor-grab'
}
</script>

<template>
  <div
    :class="[props.isSelected ? 'ring-2 ring-offset-2 ring-offset-background border-primary shadow-lg' : 'ring-0 shadow-none', 'absolute border border-default select-none transition duration-100 ring-primary rounded-lg', cursor]"
    :style="{
      left: `${node.x}px`,
      top: `${node.y}px`,
      width: `${node.width}px`,
      height: `${node.height}px`,
    }"
    @pointermove="updateCursor"
    @pointerdown="(e: PointerEvent) => emit('interaction-start', e)"
  >
    <TextNode v-if="node.type === 'text'" :node="node" :is-selected="isSelected" class="w-full h-full pointer-events-none" />
    <FileNode v-if="node.type === 'file'" :node="node" :is-selected="isSelected" class="w-full h-full pointer-events-none" />
    <LinkNode v-if="node.type === 'link'" :node="node" :is-selected="isSelected" class="w-full h-full pointer-events-none" />
    <GroupNode v-if="node.type === 'group'" :node="node" :is-selected="isSelected" class="w-full h-full pointer-events-none" />
  </div>
</template>

<style scoped>
.cursor-nwse-resize { cursor: nwse-resize; }
.cursor-nesw-resize { cursor: nesw-resize; }
.cursor-ns-resize { cursor: ns-resize; }
.cursor-ew-resize { cursor: ew-resize; }
.cursor-grab { cursor: grab; }
</style>
