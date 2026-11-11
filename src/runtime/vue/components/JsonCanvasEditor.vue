<script setup lang="ts">
import { shallowRef, computed, ref, watch, toRef } from 'vue'
import { useJsonCanvasEditor } from '../composables/useJsonCanvasEditor'
import { useNodeDragAndSelect } from '../composables/useNodeDragAndSelect'
import { useNodeHierarchy } from '../composables/useNodeHierarchy'
import { useNodeResize } from '../composables/useNodeResize'
import type { JSONCanvas } from '../../core/types'
import NodeRenderer from './NodeRenderer.vue'

const props = withDefaults(defineProps<{
  modelValue: JSONCanvas
  snapToGrid?: boolean
}>(), {
  snapToGrid: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: JSONCanvas]
}>()

const viewportRef = shallowRef<HTMLDivElement | null>(null)
const selectedNodeIds = ref<Set<string>>(new Set())

// -- Hierarchy --
const canvasNodesRef = computed(() => props.modelValue.nodes || [])
const { nodeHierarchy } = useNodeHierarchy(canvasNodesRef)

// -- Grid --
const gridSpacing = ref(24) // world units
const dotColor = ref('rgba(148, 163, 184, 0.35)') // slate-400/50

// -- Canvas Logic --
const {
  scale,
  translate,
  selectionRect,
  transformStyle,
  isPanning,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onWheel,
} = useJsonCanvasEditor({ 
  minScale: 0.25, 
  maxScale: 5,
  onSelection: (worldRect) => {
    if (!worldRect) {
      selectedNodeIds.value.clear()
      selectedNodeIds.value = new Set(selectedNodeIds.value)
      return
    }
    const newSelectedIds = new Set<string>()
    props.modelValue.nodes?.forEach(node => {
      // Simple AABB collision detection
      if (
        node.x < worldRect.x + worldRect.width &&
        node.x + node.width > worldRect.x &&
        node.y < worldRect.y + worldRect.height &&
        node.y + node.height > worldRect.y
      ) {
        newSelectedIds.add(node.id)
      }
    })
    selectedNodeIds.value = newSelectedIds
  }
})

// -- Node Interaction --
const { handleNodePointerDown } = useNodeDragAndSelect(
  toRef(props, 'modelValue'),
  scale,
  selectedNodeIds,
  nodeHierarchy,
  toRef(props, 'snapToGrid'),
  gridSpacing,
  (value: JSONCanvas) => emit('update:modelValue', value),
)

const { startResize, getHandleForMouseEvent } = useNodeResize(
  toRef(props, 'modelValue'),
  scale,
  toRef(props, 'snapToGrid'),
  gridSpacing,
  (value: JSONCanvas) => emit('update:modelValue', value),
)

function handleNodeInteractionStart(event: PointerEvent, nodeId: string) {
  const node = props.modelValue.nodes?.find(n => n.id === nodeId)
  if (!node) return
  
  const handle = getHandleForMouseEvent(event)

  if (handle) {
    startResize(event, nodeId, handle)
  } else {
    handleNodePointerDown(event, nodeId)
  }
}

const sortedNodes = computed(() => {
  if (!props.modelValue.nodes) return []
  return [...props.modelValue.nodes].sort((a, b) => {
    return nodeHierarchy.value.getNodeDepth(a.id) - nodeHierarchy.value.getNodeDepth(b.id)
  })
})

const cssVars = computed(() => {
  return {
    '--scale': String(scale.value),
    '--tx': `${translate.value.x}px`,
    '--ty': `${translate.value.y}px`,
    '--grid-size': `${gridSpacing.value * scale.value}px`,
    '--grid-pos-x': `${translate.value.x}px`,
    '--grid-pos-y': `${translate.value.y}px`,
    '--dot-color': dotColor.value,
  } as Record<string, string>
})

function setCursor(value: string) {
  if (viewportRef.value) {
    viewportRef.value.style.cursor = value
  }
}

watch(isPanning, (panning) => {
  setCursor(panning ? 'grabbing' : 'grab')
}, { immediate: true })

</script>

<template>
  <div
    ref="viewportRef"
    class="jc-canvas relative w-full h-dvh overflow-hidden select-none"
    :style="cssVars as any"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointerleave="onPointerUp"
    @wheel="onWheel"
  >
    <!-- Dotted background -->
    <div
      class="absolute inset-0"
      style="
        background-image: radial-gradient(var(--dot-color) 1px, transparent 1px);
        background-size: var(--grid-size) var(--grid-size);
        background-position: var(--grid-pos-x) var(--grid-pos-y);
      "
    />

    <!-- World content layer -->
    <div
      class="absolute inset-0"
      :style="{
        transform: transformStyle,
        transformOrigin: '0 0',
        willChange: 'transform',
      }"
    >
      <!-- Nodes will be rendered here -->
      <NodeRenderer 
        v-for="node in sortedNodes" 
        :key="node.id" 
        :node="node"
        :is-selected="selectedNodeIds.has(node.id)"
        @interaction-start="(e: PointerEvent) => {
          e.stopPropagation() // Prevent canvas pan/select
          handleNodeInteractionStart(e, node.id)
        }"
      />
    </div>

    <!-- Selection rectangle -->
    <div v-if="selectionRect"
         class="absolute border border-primary-500/60 bg-primary-500/10 rounded-sm pointer-events-none"
         :style="{
           left: selectionRect.x + 'px',
           top: selectionRect.y + 'px',
           width: selectionRect.width + 'px',
           height: selectionRect.height + 'px',
         }"
    />
  </div>
</template>

<style scoped>
</style>


