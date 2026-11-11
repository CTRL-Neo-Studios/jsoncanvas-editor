<!--
Get your module up and running quickly.

Find and replace all on all files (CMD+SHIFT+F):
- Name: JSON Canvas Editor for Nuxt
- Package name: @type32/jsoncanvas-editor-nuxt
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
bunx nuxi module add @type32/jsoncanvas-editor-nuxt
```
or
```bash
bun add @type32/jsoncanvas-editor-nuxt
```

That's it! You can now use JSON Canvas Editor in your Nuxt app ✨

> [!WARNING]
> Early rewrite towards Obsidian Canvas parity: see the [plan](https://github.com/CTRL-Neo-Studios/vertex/blob/dev/plans/Canvas%20Plan.md). The API below will change.

### Usage (Nuxt)

Add `@nuxt/ui` and this module to `nuxt.config.ts`; `<JsonCanvasEditor>` is registered globally:

```vue
<template>
  <div class="h-dvh">
    <JsonCanvasEditor v-model="canvas" />
  </div>
</template>

<script setup lang="ts">
import type { JSONCanvas } from '@type32/jsoncanvas-editor-nuxt/core'
const canvas = ref<JSONCanvas>({ nodes: [], edges: [] })
</script>
```

### Usage (Vue + Vite)

Set up [Nuxt UI for Vue](https://ui.nuxt.com/docs/getting-started/installation/vue), then:

```ts
import { JsonCanvasEditor } from '@type32/jsoncanvas-editor-nuxt/vue'
import '@type32/jsoncanvas-editor-nuxt/style.css'
```

Entry points: `@type32/jsoncanvas-editor-nuxt/core` (types, no Vue), `/vue` (components), `/style.css`.

Until the components move to the library's plain CSS, add the package to Tailwind's sources in your main CSS: `@source "../node_modules/@type32/jsoncanvas-editor-nuxt/dist";` (path relative to that file).

The editor currently supports:

- Pan (wheel, middle mouse, Space+drag) and zoom (Ctrl/Cmd+wheel)
- Rendering text/file/link/group nodes (no edges yet)
- Box and Shift/Cmd selection; drag to move (group contents move with the group); resize from the edges; optional grid snap

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
