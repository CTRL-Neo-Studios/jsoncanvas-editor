<!--
Get your module up and running quickly.

Find and replace all on all files (CMD+SHIFT+F):
- Name: JSON Canvas Editor for Nuxt
- Package name: @type32/jsoncanvas-editor
- Description: A component that allows you to input and edit a JSON Canvas.
-->

# JSON Canvas Editor for Nuxt

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![License][license-src]][license-href]
[![Nuxt][nuxt-src]][nuxt-href]

A component that allows you to input and edit a JSON Canvas.

## Quick Setup

Install the module to your Nuxt application with one command:

```bash
bunx nuxi module add @type32/jsoncanvas-editor
```
or
```bash
bun add @type32/jsoncanvas-editor
```

That's it! You can now use JSON Canvas Editor in your Nuxt app ✨

> [!WARNING]
> Early rewrite towards Obsidian Canvas parity: see the [plan](https://github.com/CTRL-Neo-Studios/vertex/blob/dev/plans/Canvas%20Plan.md). The API below will change.

### Usage (Nuxt)

Add `@nuxt/ui` and this module to `nuxt.config.ts`; `<JsonCanvas>` is registered globally. It fills its parent:

```vue
<template>
  <div class="h-dvh">
    <JsonCanvas v-model="canvas" v-model:viewport="viewport" />
  </div>
</template>

<script setup lang="ts">
import { parseCanvas, type JSONCanvas, type Viewport } from '@type32/jsoncanvas-editor/core'
const canvas = shallowRef<JSONCanvas>(parseCanvas(fileText).canvas)
const viewport = ref<Viewport>() // optional; without one the view fits the canvas
</script>
```

Edits come back through `v-model` as new objects (one per drag or key press; the object you passed is never changed). Props: `readonly`, `snapToGrid`, `snapToObjects`, `wheelBehavior` (`'pan'` or `'zoom'`), `cardLabels` (`'always'`, `'hover'` or `'never'`), `zoomBreakpoint`. The component ref exposes `canvas`, `issues`, `viewport`, `selected`, `select()`, `undo()`, `redo()`, `canUndo`, `canRedo`, `zoomToFit()`, `zoomToSelection()`, `zoomToBBox()`, `zoomBy()`, `setViewport()` and `screenToWorld()`.

### Usage (Vue + Vite)

Set up [Nuxt UI for Vue](https://ui.nuxt.com/docs/getting-started/installation/vue), then:

```ts
import { JsonCanvas } from '@type32/jsoncanvas-editor/vue'
import '@type32/jsoncanvas-editor/style.css'
```

Entry points: `@type32/jsoncanvas-editor/core` (read, write and lay out canvases; no Vue), `/vue` (components), `/style.css`. Theme it with the `--jc-*` CSS variables on `.jc-canvas`.

The editor currently:

- Reads and writes JSON Canvas files as Obsidian does, keeping data it doesn't understand (listed in `issues`; unknown nodes show as placeholders)
- Draws text, file, link and group nodes and edges with arrows, labels and colors, at Obsidian's geometry
- Pans (wheel, Space+drag, middle or right drag) and zooms (Ctrl/Cmd+wheel, pinch), with card content replaced by placeholders when zoomed far out
- Selects (click, Shift+click, drag a rectangle, Cmd/Ctrl+A), moves (groups carry what's inside; Shift locks an axis; Option/Ctrl drops copies), resizes, and snaps to the grid and to other cards with guides (Ctrl/Alt turns snapping off)
- Arrow keys nudge, Delete removes, Shift+1 / Shift+2 zoom to fit / to the selection, Cmd/Ctrl+Z undoes and Cmd/Ctrl+Shift+Z (or +Y) redoes

Connecting nodes, editing card content and the toolbars come next.

Inspiration and reference implementations for rendering-only solutions:

- `vue-json-canvas` by wujieli0207 [`github.com/wujieli0207/vue-json-canvas`](https://github.com/wujieli0207/vue-json-canvas)
- `JSON-Canvas-Viewer` by Hesprs [`github.com/Hesprs/JSON-Canvas-Viewer`](https://github.com/Hesprs/JSON-Canvas-Viewer)


## Contribution

<details>
  <summary>Local development</summary>
  
  ```bash
  # Install dependencies
  bun install
  
  # Generate type stubs
  bun run dev:prepare
  
  # Develop with the playground
  bun run dev
  
  # Build the playground
  bun run dev:build
  
  # Run Vitest
  bun run test
  bun run test:watch
  
  # Release new version
  bun run release
  ```

</details>


<!-- Badges -->
[npm-version-src]: https://img.shields.io/npm/v/my-module/latest.svg?style=flat&colorA=020420&colorB=00DC82
[npm-version-href]: https://npmjs.com/package/my-module

[npm-downloads-src]: https://img.shields.io/npm/dm/my-module.svg?style=flat&colorA=020420&colorB=00DC82
[npm-downloads-href]: https://npm.chart.dev/my-module

[license-src]: https://img.shields.io/npm/l/my-module.svg?style=flat&colorA=020420&colorB=00DC82
[license-href]: https://npmjs.com/package/my-module

[nuxt-src]: https://img.shields.io/badge/Nuxt-020420?logo=nuxt.js
[nuxt-href]: https://nuxt.com
