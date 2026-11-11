import type { Ref } from 'vue'
import type { JSONCanvas, JSONCanvasNode } from '../../core/types'

type Point = { x: number; y: number }
export type HandlePosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top' | 'bottom' | 'left' | 'right' | null

const HANDLE_THRESHOLD = 8 // in screen pixels

export function useNodeResize(
  canvas: Ref<JSONCanvas>,
  scale: Ref<number>,
  snapToGrid: Ref<boolean>,
  gridSpacing: Ref<number>,
  updateCanvas: (newCanvas: JSONCanvas) => void,
) {
  let activeNode: JSONCanvasNode | null = null
  let activeHandle: HandlePosition = null
  let startRect: { x: number, y: number, width: number, height: number } | null = null
  let startPointer: Point | null = null
  let isResizing = false
  let frameId: number | null = null

  function getHandleForMouseEvent(event: PointerEvent): HandlePosition {
    const target = event.target as HTMLElement
    const rect = target.getBoundingClientRect()
    
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top

    const onTop = y < HANDLE_THRESHOLD
    const onBottom = y > rect.height - HANDLE_THRESHOLD
    const onLeft = x < HANDLE_THRESHOLD
    const onRight = x > rect.width - HANDLE_THRESHOLD

    if (onTop && onLeft) return 'top-left'
    if (onTop && onRight) return 'top-right'
    if (onBottom && onLeft) return 'bottom-left'
    if (onBottom && onRight) return 'bottom-right'
    if (onTop) return 'top'
    if (onBottom) return 'bottom'
    if (onLeft) return 'left'
    if (onRight) return 'right'
    
    return null
  }

  function startResize(event: PointerEvent, nodeId: string, handle: HandlePosition) {
    if (event.button !== 0 || !handle) return
    event.stopPropagation()

    const node = canvas.value.nodes?.find(n => n.id === nodeId)
    if (!node) return

    activeNode = node
    activeHandle = handle
    startRect = { x: node.x, y: node.y, width: node.width, height: node.height }
    startPointer = { x: event.clientX, y: event.clientY }
    isResizing = true

    window.addEventListener('pointermove', onResize)
    window.addEventListener('pointerup', endResize)
  }

  function onResize(event: PointerEvent) {
    if (!isResizing) return
    if (frameId) cancelAnimationFrame(frameId)
    
    frameId = requestAnimationFrame(() => {
      if (!startPointer || !activeNode || !activeHandle || !startRect) return

      const dx = (event.clientX - startPointer.x) / scale.value
      const dy = (event.clientY - startPointer.y) / scale.value

      let newX = startRect.x
      let newY = startRect.y
      let newWidth = startRect.width
      let newHeight = startRect.height

      if (activeHandle.includes('left')) {
        newX = startRect.x + dx
        newWidth = startRect.width - dx
      }
      if (activeHandle.includes('right')) {
        newWidth = startRect.width + dx
      }
      if (activeHandle.includes('top')) {
        newY = startRect.y + dy
        newHeight = startRect.height - dy
      }
      if (activeHandle.includes('bottom')) {
        newHeight = startRect.height + dy
      }

      if (snapToGrid.value) {
        if (activeHandle.includes('left')) {
          const snappedX = Math.round(newX / gridSpacing.value) * gridSpacing.value
          newWidth += newX - snappedX
          newX = snappedX
        }
        if (activeHandle.includes('right')) {
          const right = newX + newWidth
          const snappedRight = Math.round(right / gridSpacing.value) * gridSpacing.value
          newWidth = snappedRight - newX
        }
        if (activeHandle.includes('top')) {
          const snappedY = Math.round(newY / gridSpacing.value) * gridSpacing.value
          newHeight += newY - snappedY
          newY = snappedY
        }
        if (activeHandle.includes('bottom')) {
          const bottom = newY + newHeight
          const snappedBottom = Math.round(bottom / gridSpacing.value) * gridSpacing.value
          newHeight = snappedBottom - newY
        }
      }
      
      // Prevent negative dimensions and snap to grid
      const minSize = 24
      if (newWidth < minSize) {
        if (activeHandle.includes('left')) newX = startRect.x + startRect.width - minSize
        newWidth = minSize
      }
      if (newHeight < minSize) {
        if (activeHandle.includes('top')) newY = startRect.y + startRect.height - minSize
        newHeight = minSize
      }

      const newNodes = canvas.value.nodes?.map(n => {
        if (n.id === activeNode!.id) {
          return {
            ...n,
            x: Math.round(newX),
            y: Math.round(newY),
            width: Math.round(newWidth),
            height: Math.round(newHeight),
          }
        }
        return n
      })

      if (newNodes) {
        updateCanvas({ ...canvas.value, nodes: newNodes })
      }
    })
  }

  function endResize() {
    if (frameId) cancelAnimationFrame(frameId)
    isResizing = false
    activeNode = null
    activeHandle = null
    startRect = null
    startPointer = null
    window.removeEventListener('pointermove', onResize)
    window.removeEventListener('pointerup', endResize)
  }

  return {
    getHandleForMouseEvent,
    startResize,
  }
}
