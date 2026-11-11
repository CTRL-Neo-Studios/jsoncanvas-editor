import { computed, type Ref } from 'vue'
import type { JSONCanvasNode } from '../../core/types'

export function useNodeHierarchy(nodes: Ref<JSONCanvasNode[]>) {
  const nodeHierarchy = computed(() => {
    const parents = new Map<string, string>() // Map<childId, parentId>
    const groupNodes = nodes.value.filter(n => n.type === 'group')

    for (const node of nodes.value) {
      let smallestParent: JSONCanvasNode | null = null
      let smallestParentArea = Infinity

      for (const group of groupNodes) {
        if (node.id === group.id) continue // A node cannot be its own parent

        const isInside =
          node.x >= group.x &&
          node.y >= group.y &&
          node.x + node.width <= group.x + group.width &&
          node.y + node.height <= group.y + group.height

        if (isInside) {
          const groupArea = group.width * group.height
          if (groupArea < smallestParentArea) {
            smallestParent = group
            smallestParentArea = groupArea
          }
        }
      }

      if (smallestParent) {
        parents.set(node.id, smallestParent.id)
      }
    }

    const children = new Map<string, Set<string>>()
    for (const [childId, parentId] of parents.entries()) {
      if (!children.has(parentId)) {
        children.set(parentId, new Set())
      }
      children.get(parentId)!.add(childId)
    }

    function getDescendants(nodeId: string): Set<string> {
      const descendants = new Set<string>()
      const queue = [nodeId]
      
      while (queue.length > 0) {
        const currentId = queue.shift()!
        const directChildren = children.get(currentId)
        if (directChildren) {
          for (const childId of directChildren) {
            if (!descendants.has(childId)) {
              descendants.add(childId)
              queue.push(childId)
            }
          }
        }
      }
      return descendants
    }

    function getNodeDepth(nodeId: string): number {
      let depth = 0
      let currentId = nodeId
      while (parents.has(currentId)) {
        depth++
        currentId = parents.get(currentId)!
        if (depth > 100) return Infinity // Cycle breaker
      }
      return depth
    }

    return { getDescendants, getNodeDepth }
  })

  return {
    nodeHierarchy,
  }
} 