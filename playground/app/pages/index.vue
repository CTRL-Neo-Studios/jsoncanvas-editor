<script setup lang="ts">
import type { JSONCanvas } from '@type32/jsoncanvas-editor-nuxt/core'

const canvas = ref<JSONCanvas>({
  nodes: [
    {
      id: 'text-node-1',
      type: 'text',
      x: 100,
      y: 100,
      width: 200,
      height: 100,
      text: 'This is a **text** node.'
    },
    {
      id: 'file-node-1',
      type: 'file',
      x: 400,
      y: 200,
      width: 250,
      height: 60,
      file: '/path/to/some/file.md'
    },
    {
      id: 'link-node-1',
      type: 'link',
      x: 300,
      y: 400,
      width: 300,
      height: 60,
      url: 'https://nuxt.com'
    },
    {
      id: 'group-node-1',
      type: 'group',
      x: 50,
      y: 300,
      width: 400,
      height: 200,
      label: 'A Group okokok'
    }
  ]
})
</script>

<template>
  <div class="h-dvh">
    <JsonCanvasEditor v-model="canvas" />
  </div>
  
</template>

<style scoped>
</style>