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

Edits come back through `v-model` as new objects (one per drag or key press; the object you passed is never changed). `v-model:readonly`, `v-model:snapToGrid` and `v-model:snapToObjects` are also changed from the canvas's settings. Other props: `wheelBehavior` (`'pan'` or `'zoom'`), `cardLabels` (`'always'`, `'hover'` or `'never'`), `zoomBreakpoint`, `host`, `fileRenderers`, `nodeRenderers`, `cardTemplates`, `modDragBehavior` (what Mod+drag on empty canvas makes: `'menu'`, `'card'`, `'file'`, `'media'`, `'webpage'` or `'group'`), `messages` and `toolbar` / `controls` / `cardBar` (`false` hides them). The component ref exposes `canvas`, `issues`, `viewport`, `selected` (node and edge keys), `select()`, `addNode()`, `actions`, `undo()`, `redo()`, `canUndo`, `canRedo`, `zoomToFit()`, `zoomToSelection()`, `zoomToBBox()`, `zoomBy()`, `setViewport()`, `screenToWorld()`, `refreshFiles()`, `exportPng()`, `openExport()` and `openHelp()`.

The chrome uses Nuxt UI (inside `<UApp>`, as Nuxt UI needs): a toolbar above the selection, controls at the right (settings, zoom, undo/redo, export, help), and a bar of cards to add at the bottom. Each can be hidden by prop or replaced by a slot (`#toolbar`, `#controls`, `#card-bar`, `#empty`), which gets `actions` (what the built-in chrome calls). Every string can be replaced through `messages` (`MESSAGES` lists them). Context menus can be extended from the `menu` event: push groups of Nuxt UI menu items onto `event.items` (`event.kind` is `canvas`, `node`, `edge` or `selection`).

`exportPng({ frame, scale, privacy, padding, watermark })` resolves to a PNG `Blob` of the whole canvas (`frame: 'full'`, the default, with `padding` 100 around the cards) or of what the view shows (`'viewport'`). `scale` is image pixels per canvas unit (default: the screen's pixel ratio, times the zoom for the viewport), lowered so no side passes 16,284 px. Every card in the frame is drawn with its content; web pages and PDFs, which can't be captured, show their placeholder. `privacy` draws text as bars, and the `#watermark` slot (a logo) is drawn at the bottom left unless `watermark: false`. With `host.saveImage(png)`, the controls offer Obsidian's Export as image dialog, which saves through it.

`host` (a `CanvasHost`, every member optional) connects the canvas to the app around it; without a member, the canvas leaves out what needs it:

| Member | Used for |
|---|---|
| `resolveFile(path)` → `{ exists, name?, ext?, url? }` | file cards: missing files, and where images, video, audio and PDFs load from |
| `readText(path)` | notes and canvases shown in cards |
| `pickFile({ kinds? })` | Swap file, and Add file in a dropped edge's menu |
| `listLinks(path)` → `{ file, subpath? }[]` | a note's links in a dropped edge's menu |
| `openFile(path, subpath, newTab)` | double-click (or Mod+click) on a card's name, a click on a selected generic or canvas card |
| `openLink(target)` | `[[wiki-links]]` in cards |
| `importFiles(files)` → paths | files pasted or dropped onto the canvas (from the OS) become file cards |
| `filesIn(data)` → paths | the app's own drags and pastes (rows from its file tree) become file cards; read `data` before any `await` |
| `saveImage(png)` | saving an image from the Export as image dialog (without it, the dialog isn't offered) |

Loaded files are cached; call `refreshFiles(paths?)` when they change outside the canvas.

#### Custom cards

Any card can be replaced, and new node types added, with a component per `type` in `nodeRenderers`, or a `#node-<type>` slot (which wins):

```vue
<JsonCanvas v-model="canvas" :node-renderers="{ shape: ShapeCard }">
  <template #node-sticky="{ node, editing, update, done }">
    <textarea v-if="editing" :value="node.note" @change="update({ note: $event.target.value })" @keydown.escape="done()" />
    <p v-else>{{ node.note }}</p>
  </template>
</JsonCanvas>
```

A card gets `node`, `selected`, `focused` (the only thing selected), `editing` (double-clicked into), `contentHidden` (zoomed far out), `readonly`, `host`, `update(patch)` (saves, one undo step; `undefined` removes a key) and `done()` (ends editing). The canvas moves, resizes, connects and snaps any card by its `x`, `y`, `width` and `height`; every other field is the card's. Nodes of a type with a card aren't reported in `issues`, and `addNode({ type, x, y, width, height, ... })` adds one. To offer a custom card in the bottom bar and the add menus, pass `cardTemplates`: `[{ label: 'Add sticky', icon: 'i-lucide-notebook-pen', node: { type: 'sticky', note: '', width: 250, height: 160 } }]`. File cards can also be replaced per extension with `fileRenderers` (`{ base: BaseCard }`, props `node`, `file`, `host`), and a text card's Markdown or editor alone with the `#text-display` / `#text-editor` slots.

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
- Connects nodes by dragging from a side's dot; an edge dropped on empty canvas offers to add a card, a file (`host.pickFile`) or a note the source links to (`host.listLinks`). Dragging an edge moves its nearer end (dropped on nothing, it's removed). Clicking an edge selects it, clicking it again edits its label; its right-click menu edits the label, sets the line direction, follows it to the far end, or removes it
- Shows text cards as Markdown (Obsidian's flavour without raw HTML; wiki-links go to `host.openLink`) and edits them on double-click (Escape or a click elsewhere saves). Double-clicking a card's bottom or right edge fits it to its text
- Shows file cards by kind: notes (narrowed to a `#heading` or `#^block`), images and video (cards keep the media's shape), audio, PDFs (`#page=N`), other canvases as a minimap, and missing files with Swap file / Remove. Link cards show the page in a sandboxed frame (YouTube and X posts as their embeds). Groups show a background image (cover, repeat, or keep its ratio) and rename on double-click
- Right-click menus for cards: Edit, Edit label, Swap file, Open in new tab, and for links Change URL, Open in browser, Copy URL, Reload page
- A floating toolbar above the selection, by what's selected: Remove, Set color (presets or any color), Zoom to selection, Edit, Create group, Align (align, arrange, distribute, justify), Line direction, Edit/Remove label, Set/Edit a group's background
- Right-click on empty canvas to add cards, files, media, web pages, groups or custom cards, undo/redo, select all, zoom to fit and toggle snapping and read-only; on a multi-selection for the toolbar's actions. Double-click empty canvas to add a card; Mod+drag to add one at the drawn size
- Controls for settings, zoom, undo/redo and a help dialog of every gesture and key; a bottom bar to click or drag new cards in; a hint on an empty canvas
- Copy, cut and paste cards with the edges among them (Obsidian's `obsidian/canvas` clipboard format, so cards copy to and from Obsidian, plus the JSON as plain text). Pasted text becomes a card, a pasted `http(s)` URL a web page, pasted or dropped files file cards (`host.importFiles`); the app's own drags through `host.filesIn`. A host without browser clipboard events (WebKit fires none with no text selected) can call `actions.copy(dataTransfer)` / `actions.paste(dataTransfer)` itself
- Exports the canvas, or the view, as a PNG (privacy mode, a watermark slot)

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
