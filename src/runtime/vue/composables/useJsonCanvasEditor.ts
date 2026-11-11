import { ref, computed } from 'vue'
import { useMagicKeys } from '@vueuse/core'
import type { Rect, Point } from '../../core/types'

export interface UseJsonCanvasEditorOptions {
  minScale?: number
  maxScale?: number
  onSelection?: (worldRect: Rect | null) => void
}

export function useJsonCanvasEditor(options: UseJsonCanvasEditorOptions = {}) {
  const { minScale = 0.25, maxScale = 5, onSelection } = options

  // -- State --
  const translate = ref<Point>({ x: 0, y: 0 })
  const scale = ref(1)
  const isPanning = ref(false)
  const panStart = ref<Point>({ x: 0, y: 0 })
  const isSelecting = ref(false)
  const selectionStart = ref<Point | null>(null)
  const selectionRect = ref<Rect | null>(null)

  const keys = useMagicKeys()
  const isSpaceDown = computed(() => keys.space?.value === true)
  const isCtrlOrMetaDown = computed(() => keys.ctrl?.value === true || keys.meta?.value === true)

  // -- Computed --
  const transformStyle = computed(() => {
    return `translate(${translate.value.x}px, ${translate.value.y}px) scale(${scale.value})`
  })

  // -- Event Handlers --
  function onPointerDown(event: PointerEvent) {
    const target = event.currentTarget as HTMLElement
    if (!target) return
    target.setPointerCapture(event.pointerId)

    // Pan start (middle mouse or space + left click)
    if (event.button === 1 || (event.button === 0 && isSpaceDown.value)) {
      isPanning.value = true
      panStart.value = { x: event.clientX - translate.value.x, y: event.clientY - translate.value.y }
      event.preventDefault()
    }
    // Selection start (left click without space)
    else if (event.button === 0 && !isSpaceDown.value) {
      const rect = target.getBoundingClientRect()
      const sx = event.clientX - rect.left
      const sy = event.clientY - rect.top
      selectionStart.value = { x: sx, y: sy }
      selectionRect.value = { x: sx, y: sy, width: 0, height: 0 }
      isSelecting.value = true
    }
  }

  function onPointerMove(event: PointerEvent) {
    // Panning
    if (isPanning.value) {
      translate.value = {
        x: event.clientX - panStart.value.x,
        y: event.clientY - panStart.value.y,
      }
    }
    // Selecting
    else if (isSelecting.value && selectionStart.value) {
      const target = event.currentTarget as HTMLElement
      const rect = target.getBoundingClientRect()
      const sx = event.clientX - rect.left
      const sy = event.clientY - rect.top
      const x = Math.min(sx, selectionStart.value.x)
      const y = Math.min(sy, selectionStart.value.y)
      const w = Math.abs(sx - selectionStart.value.x)
      const h = Math.abs(sy - selectionStart.value.y)
      selectionRect.value = { x, y, width: w, height: h }
    }
  }

  function onPointerUp(event: PointerEvent) {
    const target = event.currentTarget as HTMLElement
    if (target && target.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId)
    }
    isPanning.value = false
    
    // Finalize selection
    if (isSelecting.value) {
      isSelecting.value = false
      if (selectionRect.value && selectionRect.value.width > 5 && selectionRect.value.height > 5) {
        const worldRect = {
          x: (selectionRect.value.x - translate.value.x) / scale.value,
          y: (selectionRect.value.y - translate.value.y) / scale.value,
          width: selectionRect.value.width / scale.value,
          height: selectionRect.value.height / scale.value,
        }
        onSelection?.(worldRect)
      } else {
        onSelection?.(null)
      }
      
      selectionStart.value = null
      selectionRect.value = null
    }
  }

  function onWheel(event: WheelEvent) {
    event.preventDefault()
    
    if (isCtrlOrMetaDown.value) {
      // Zoom
      const delta = event.deltaY > 0 ? 0.9 : 1.1
      const newScale = scale.value * delta
      if (newScale > maxScale || newScale < minScale) return
      
      const mouseX = event.clientX - translate.value.x
      const mouseY = event.clientY - translate.value.y

      scale.value = newScale
      translate.value = {
        x: event.clientX - mouseX * delta,
        y: event.clientY - mouseY * delta,
      }
    } else {
      // Pan
      translate.value = {
        x: translate.value.x - event.deltaX,
        y: translate.value.y - event.deltaY,
      }
    }
  }

  function screenToWorld(x: number, y: number): Point {
    return {
      x: (x - translate.value.x) / scale.value,
      y: (y - translate.value.y) / scale.value,
    }
  }

  return {
    // State
    scale,
    translate,
    selectionRect,
    // Computed
    transformStyle,
    isPanning,
    // Handlers
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onWheel,
    screenToWorld,
  }
}
