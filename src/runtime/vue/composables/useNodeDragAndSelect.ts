import type { Ref } from 'vue'
import type { JSONCanvas, Point } from '../../core/types'

type Hierarchy = {
  getDescendants: (nodeId: string) => Set<string>
}

export function useNodeDragAndSelect(
  canvas: Ref<JSONCanvas>,
  scale: Ref<number>,
  selectedNodeIds: Ref<Set<string>>,
  hierarchy: Ref<Hierarchy>,
  snapToGrid: Ref<boolean>,
  gridSpacing: Ref<number>,
  updateCanvas: (newCanvas: JSONCanvas) => void,
) {
  const dragStartPositions: Map<string, Point> = new Map()
  let dragStartPointer: Point | null = null
  let isDragging = false
  let frameId: number | null = null
  let primaryNodeId: string | null = null

  function handleNodePointerDown(event: PointerEvent, nodeId: string) {
    if (event.button !== 0) return

    const isSelected = selectedNodeIds.value.has(nodeId)
    const isMetaKey = event.ctrlKey || event.metaKey || event.shiftKey

    if (!isSelected && !isMetaKey) {
      selectedNodeIds.value = new Set([nodeId])
    } else if (isMetaKey && isSelected) {
      selectedNodeIds.value.delete(nodeId)
      selectedNodeIds.value = new Set(selectedNodeIds.value) // force reactivity
    } else if (isMetaKey && !isSelected) {
      selectedNodeIds.value.add(nodeId)
      selectedNodeIds.value = new Set(selectedNodeIds.value) // force reactivity
    }

    dragStartPositions.clear()
    const nodesToDrag = new Set(selectedNodeIds.value)
    for (const id of selectedNodeIds.value) {
      const descendants = hierarchy.value.getDescendants(id)
      descendants.forEach(descId => nodesToDrag.add(descId))
    }
    
    for (const id of nodesToDrag) {
      const node = canvas.value.nodes?.find(n => n.id === id)
      if (node) {
        dragStartPositions.set(id, { x: node.x, y: node.y })
      }
    }

    dragStartPointer = { x: event.clientX, y: event.clientY }
    isDragging = true
    primaryNodeId = nodeId

    window.addEventListener('pointermove', onDrag)
    window.addEventListener('pointerup', endDrag)
  }

  const onDrag = (event: PointerEvent) => {
    if (!isDragging) return
    if (frameId) cancelAnimationFrame(frameId)
    
    frameId = requestAnimationFrame(() => {
      if (!dragStartPointer || !primaryNodeId) return

      const dx = (event.clientX - dragStartPointer.x) / scale.value
      const dy = (event.clientY - dragStartPointer.y) / scale.value

      let finalDx = dx
      let finalDy = dy

      if (snapToGrid.value) {
        const primaryNodeStart = dragStartPositions.get(primaryNodeId)
        if (primaryNodeStart) {
          const newX = primaryNodeStart.x + dx
          const newY = primaryNodeStart.y + dy
          const snappedX = Math.round(newX / gridSpacing.value) * gridSpacing.value
          const snappedY = Math.round(newY / gridSpacing.value) * gridSpacing.value
          finalDx = dx + (snappedX - newX)
          finalDy = dy + (snappedY - newY)
        }
      }

      const newNodes = canvas.value.nodes?.map((node) => {
        const startPos = dragStartPositions.get(node.id)
        if (startPos) {
          return {
            ...node,
            x: Math.round(startPos.x + finalDx),
            y: Math.round(startPos.y + finalDy),
          }
        }
        return node
      })

      if (newNodes) {
        updateCanvas({ ...canvas.value, nodes: newNodes })
      }
    })
  }

  function endDrag() {
    if (frameId) cancelAnimationFrame(frameId)
    isDragging = false
    primaryNodeId = null
    dragStartPointer = null
    dragStartPositions.clear()
    window.removeEventListener('pointermove', onDrag)
    window.removeEventListener('pointerup', endDrag)
  }

  return {
    handleNodePointerDown,
  }
}
