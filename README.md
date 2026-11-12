# JSON Canvas Editor

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![License][license-src]][license-href]
[![Nuxt][nuxt-src]][nuxt-href]

An editor for [JSON Canvas](https://jsoncanvas.org) files that works like Obsidian's Canvas, for Nuxt and Vue, built on [Nuxt UI](https://ui.nuxt.com).

- Reads and writes `.canvas` files the way Obsidian does (same formatting, so files edited in both diff cleanly), keeping any data it doesn't understand.
- Text cards in Markdown, file cards (notes, images, video, audio, PDFs, other canvases), web pages, groups with backgrounds, and edges with labels, arrows and colors.
- Obsidian's gestures, toolbar, menus, snapping, alignment, undo, copy and paste (to and from Obsidian too), and export as PNG.
- Files come from your app through a small `host` object, so the editor works over a vault, a server, or the browser's file system.
- Custom card types, replaceable chrome, and every string translatable.

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [`<JsonCanvas>`](#jsoncanvas): props, models, events, slots, methods
- [The host](#the-host)
- [Custom cards](#custom-cards)
- [Chrome, menus and strings](#chrome-menus-and-strings)
- [Clipboard and drops](#clipboard-and-drops)
- [Export as PNG](#export-as-png)
- [Theming](#theming)
- [`/core`](#core)
- [Keyboard and mouse](#keyboard-and-mouse)
- [Development](#development)

## Install

### Nuxt

Nuxt UI is required; follow its [installation](https://ui.nuxt.com/docs/getting-started/installation/nuxt), then add this module. The canvas's icons are [Lucide](https://lucide.dev)'s; installing them locally saves fetching them at runtime:

```bash
bun add @nuxt/ui tailwindcss @type32/jsoncanvas-editor
bun add -D @iconify-json/lucide
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@type32/jsoncanvas-editor'],
  css: ['~/assets/css/main.css'],
})
```

```css
/* app/assets/css/main.css */
@import "tailwindcss";
@import "@nuxt/ui";
```

```vue
<!-- app/app.vue: Nuxt UI's tooltips, toasts and dialogs need <UApp> around the app -->
<template>
  <UApp>
    <NuxtPage />
  </UApp>
</template>
```

The module registers `<JsonCanvas>` globally and adds its stylesheet. Types and helpers come from `@type32/jsoncanvas-editor/core` and `@type32/jsoncanvas-editor/vue`.

### Vue + Vite

Set up [Nuxt UI for Vue](https://ui.nuxt.com/docs/getting-started/installation/vue) (with `<UApp>` around the app), then:

```bash
bun add @type32/jsoncanvas-editor
```

```ts
import { JsonCanvas } from '@type32/jsoncanvas-editor/vue'
import '@type32/jsoncanvas-editor/style.css'
```

## Quick start

A canvas with file cards, its files served from `public/vault/`:

```text
public/vault/Board.canvas
public/vault/Notes/Welcome.md
public/vault/photo.jpg
```

```vue
<!-- app/pages/index.vue -->
<script setup lang="ts">
import { parseCanvas, stringifyCanvas, type JSONCanvas } from '@type32/jsoncanvas-editor/core'
import type { CanvasHost } from '@type32/jsoncanvas-editor/vue'

const url = (path: string) => `/vault/${path.split('/').map(encodeURIComponent).join('/')}`

// Where the canvas gets its files: whether one exists, its URL, and the text of notes.
const host: CanvasHost = {
  resolveFile: async path => ({ exists: (await fetch(url(path), { method: 'HEAD' })).ok, url: url(path) }),
  readText: async path => (await fetch(url(path))).text(),
}

const canvas = shallowRef<JSONCanvas>()
onMounted(async () => {
  canvas.value = parseCanvas(await (await fetch(url('Board.canvas'))).text()).canvas
})

// Each edit arrives as a new document; write it wherever the file lives.
watch(canvas, (doc, before) => {
  if (doc && before) console.log(stringifyCanvas(doc))
})
</script>

<template>
  <div class="h-dvh">
    <JsonCanvas v-if="canvas" v-model="canvas" :host="host" />
  </div>
</template>
```

`<JsonCanvas>` fills its parent, so give the parent a height. It's shown once the file is read, so the view fits it from the start. An empty canvas (`{ nodes: [], edges: [] }`, or `parseCanvas('')`) works too: double-click to add a card, or drag one from the bar at the bottom.

## `<JsonCanvas>`

### Models

| Model | Type | |
|---|---|---|
| `v-model` | `JSONCanvas` (required) | The document. Edits come back as new objects (one per drag, key press or menu action); the object you pass is never changed. Passing a different document replaces the one shown and clears undo. |
| `v-model:viewport` | `Viewport` (`{ x, y, zoom }`) | Where the view is (the world point at its centre, and log2 of the scale), set when the view comes to rest. Without one at mount, the view fits the canvas. |
| `v-model:readonly` | `boolean` (`false`) | Nothing can be changed; selecting, panning, zooming, copying and exporting still work. Also toggled from the settings and the lock button. |
| `v-model:snapToGrid` | `boolean` (`true`) | Moved and resized cards snap to the grid. |
| `v-model:snapToObjects` | `boolean` (`true`) | Moved and resized cards snap to other cards' edges and centres. |

Plain props work for the last three as well (`:readonly="true"`).

### Props

| Prop | Type (default) | |
|---|---|---|
| `host` | `CanvasHost` | What the canvas asks of your app: [the host](#the-host). |
| `wheelBehavior` | `'pan'` \| `'zoom'` (`'pan'`) | What a plain mouse wheel does; the other happens with Mod or Space held. |
| `cardLabels` | `'always'` \| `'hover'` \| `'never'` (`'always'`) | File names and URLs above file and link cards. |
| `zoomBreakpoint` | `number` (`0`) | How much further out (log2 units) card content stays before placeholders show. |
| `modDragBehavior` | `'menu'` \| `'card'` \| `'file'` \| `'media'` \| `'webpage'` \| `'group'` (`'menu'`) | What Mod+drag on empty canvas creates at the drawn size. |
| `nodeRenderers` | `Record<string, Component>` | Cards by node type: replace `text`, `file`, `link` or `group`, or add your own types. |
| `fileRenderers` | `Record<string, Component>` | File cards by extension (`{ base: BaseCard }`). |
| `cardTemplates` | `CardTemplate[]` | Custom cards offered in the bottom bar and the add menus. |
| `messages` | `Partial<CanvasMessages>` | Replacements for any of the canvas's strings. |
| `toolbar`, `controls`, `cardBar` | `boolean` (`true`) | Show the floating selection toolbar, the controls at the right, and the bottom bar. |

### Events

| Event | Payload | |
|---|---|---|
| `menu` | `CanvasMenuEvent` | A context menu is about to open. `kind` is `'canvas'`, `'node'`, `'edge'` or `'selection'`, `key` the node or edge, `at` the world point. Push groups of Nuxt UI `DropdownMenuItem`s onto `items` to add to it. |
| `update:*` | | The models above. |

### Slots

| Slot | Props | |
|---|---|---|
| `#node-<type>` | `NodeRendererProps` | A card for nodes of `type` (see [custom cards](#custom-cards)); wins over `nodeRenderers`. |
| `#text-display` | `{ node, text }` | A text card's content, instead of the Markdown. |
| `#text-editor` | `{ node, text, update, done }` | A text card's editor, instead of the textarea. `update(text)` as it's typed; `done()` ends editing. |
| `#toolbar` | `{ actions }` | Replaces the floating toolbar. |
| `#controls` | `{ settings, actions, openHelp, openExport }` | Replaces the controls. |
| `#card-bar` | `{ actions, templates }` | Replaces the bottom bar. |
| `#empty` | | Replaces the hint on an empty canvas. |
| `#watermark` | | Drawn at the bottom left of exported images (a logo). |

### Methods and state

Through a template ref (`const editor = useTemplateRef('editor')`):

| | |
|---|---|
| `canvas` | The document as shown. |
| `issues` | `CanvasIssue[]`: what can't be shown as the spec intends (unknown node types without a card, invalid nodes and edges, edges to missing nodes, duplicate ids). |
| `viewport` | The live viewport. |
| `selected`, `select(keys)` | Keys of the selected nodes and edges (their ids, unless an id is shared). |
| `addNode(fields)` | Adds a node of any type on top, selects it, returns its id. |
| `undo()`, `redo()`, `canUndo`, `canRedo` | History (100 steps). |
| `zoomToFit(jump?)`, `zoomToSelection()`, `zoomToBBox(box, jump?)`, `zoomBy(dz, at?)`, `setViewport(v)`, `screenToWorld({ clientX, clientY })` | The view. |
| `refreshFiles(paths?)` | Forgets cached files (all, or `paths`), so cards showing them load again. Call it when files change outside the canvas. |
| `exportPng(options?)` | A PNG `Blob` ([export](#export-as-png)). |
| `openHelp()`, `openExport()` | The help and export dialogs. |
| `actions` | `CanvasActions`: what the toolbar, menus and bars do, for chrome of your own: `toolbarItems`, `toolbarAnchor`, `setColor`, `removeSelection`, `createGroup`, `layout`, `setLineDirection`, `add`, `creationItems`, `createWithSize`, `menu`, `copy`, `cut`, `paste`. |

## The host

`host` connects the canvas to your app. Every member is optional; without one, the canvas leaves out what needs it (without `pickFile`, there's no Add file; without `readText`, notes show as file names).

| Member | Used for |
|---|---|
| `resolveFile(path)` → `{ exists, name?, ext?, url? }` | File cards: missing files, and the URL images, video, audio and PDFs load from. Without it, every file counts as existing. |
| `readText(path)` → `string` | Notes and canvases shown in cards. |
| `pickFile({ kinds? })` → `path \| undefined` | Add file / Add media, Swap file, a group's background. `kinds`: `'markdown'`, `'image'`, `'video'`, `'audio'`, `'pdf'`, `'canvas'`, `'other'`. |
| `listLinks(path)` → `{ file, subpath? }[]` | A note's links, offered when an edge from it is dropped on empty canvas. |
| `openFile(path, subpath, newTab)` | Double-click (or Mod+click) on a card's name; a click on a selected canvas or other file card. |
| `openLink(target)` | `[[wiki-links]]` clicked in cards. |
| `importFiles(files)` → `paths` | Files pasted or dropped from the OS: store them, return their paths; they become file cards. |
| `filesIn(data)` → `paths \| undefined` | Your app's own drags and pastes (rows from a file tree): the paths a `DataTransfer` carries. Read `data` before any `await`. |
| `saveImage(png)` | Saves an image from the Export as image dialog; without it, the dialog isn't offered. |

Paths are whatever your app uses (Obsidian uses vault-relative paths like `Notes/Welcome.md`). Answers are cached per path until `refreshFiles`.

## Custom cards

Any card can be replaced, and new node types added, with a component in `nodeRenderers` or a `#node-<type>` slot:

```vue
<JsonCanvas v-model="canvas" :node-renderers="{ shape: ShapeCard }" :card-templates="templates">
  <template #node-sticky="{ node, editing, update, done }">
    <textarea v-if="editing" :value="node.note" @change="update({ note: $event.target.value })" @keydown.escape="done()" />
    <p v-else>{{ node.note }}</p>
  </template>
</JsonCanvas>
```

```ts
const templates: CardTemplate[] = [
  { label: 'Add sticky', icon: 'i-lucide-notebook-pen', node: { type: 'sticky', note: '', width: 250, height: 160 } },
]
```

A card gets `node`, `selected`, `focused` (the only thing selected), `editing` (double-clicked into), `contentHidden` (zoomed far out), `readonly`, `host`, `update(patch)` (saves as one undo step; a key set to `undefined` is removed) and `done()` (ends editing). The canvas moves, resizes, connects, snaps, colors and copies any card by its `x`, `y`, `width`, `height` and `color`; every other field is the card's. Nodes of a type with a card aren't reported in `issues`.

File cards can be replaced per extension with `fileRenderers` (props `node`, `file` (the host's `ResolvedFile`), `host`).

## Chrome, menus and strings

The chrome is Nuxt UI: the floating toolbar above the selection, the controls at the right (settings, zoom, undo/redo, export, help), and the bar of cards to add at the bottom. Each can be hidden (`:toolbar="false"`) or replaced by its slot, which gets `actions`.

Context menus can be extended from the `menu` event:

```ts
function onMenu(e: CanvasMenuEvent) {
  if (e.kind === 'node') e.items.push([{ label: 'Reveal in files', icon: 'i-lucide-folder', onSelect: () => reveal(e.key!) }])
}
```

Every string is in `MESSAGES` (exported from `/vue`); pass any of them, translated, through `messages`. Placeholders such as `{file}` are filled in.

## Clipboard and drops

Copy (Mod+C) and cut put the selected cards, with the edges among them, on the clipboard in Obsidian's format (`obsidian/canvas`), so they paste into Obsidian and back, and as JSON text. Paste (Mod+V) adds, in order of preference: your app's files (`host.filesIn`), files (`host.importFiles`, laid out in rows), copied cards (new ids, centred in the view), a web page for an `http(s)` URL, or a text card. Dropping onto the canvas does the same at the drop point.

WebKit (Safari, Tauri on macOS) fires no copy or paste event without selected text. A host there can call `actions.copy(dataTransfer)`, `actions.cut(dataTransfer)` and `actions.paste(dataTransfer)` from its own shortcuts, with `new DataTransfer()` and its clipboard's text.

## Export as PNG

```ts
const png = await editor.value!.exportPng({ frame: 'full', scale: 2, privacy: false })
```

| Option | Default | |
|---|---|---|
| `frame` | `'full'` | The whole canvas, or `'viewport'`: what the view shows. |
| `scale` | the screen's pixel ratio (times the zoom for the viewport) | Image pixels per canvas unit; lowered so no side passes 16,284 px. |
| `padding` | `100` | Around the cards (full canvas only). |
| `privacy` | `false` | Draws every word as a bar. |
| `watermark` | `true` | Includes the `#watermark` slot at the bottom left. |

Every card in the frame is drawn with its content. Web pages and PDFs can't be captured, so they show their placeholder. With `host.saveImage`, the controls offer Obsidian's Export as image dialog.

## Theming

The canvas follows Nuxt UI's colors (`--ui-bg`, `--ui-text`, `--ui-primary`, ...), light and dark. Override these on `.jc-canvas` or an ancestor:

| Variable | |
|---|---|
| `--jc-color-1` … `--jc-color-6` | The six preset colors (red, orange, yellow, green, cyan, purple). |
| `--jc-default-color` | Cards and edges without a color. |
| `--jc-accent` | Selection, handles and snap guides. |
| `--jc-dot-color` | The background dots. |
| `--jc-radius`, `--jc-shadow` | Cards' corners and shadow. |
| `--jc-font` | The font (default: inherited). |

The stylesheet is plain CSS with `jc-` classes; it uses no Tailwind utilities.

## `/core`

`@type32/jsoncanvas-editor/core` has no Vue dependency: use it on a server or in a worker.

| | |
|---|---|
| **Types** | `JSONCanvas`, `JSONCanvasNode` (`…TextNode`, `…FileNode`, `…LinkNode`, `…GroupNode`), `JSONCanvasEdge`, `CanvasIssue`, `CanvasSide`, `CanvasEnd`, `CanvasColor`, `Viewport`, `BBox`, `Point`, `Rect` |
| **Files** | `parseCanvas(text)` → `{ canvas, issues }` (throws on invalid JSON, so a broken file is never overwritten), `normalizeCanvas(data)`, `stringifyCanvas(canvas)` (Obsidian's formatting), `newId()` |
| **Checks** | `isSupportedNode`, `isSupportedEdge`, `nodeBox`, `orderNodes` (groups behind, larger first) |
| **Edits** | `removeFromCanvas`, `cloneNodes`, `raiseNodes`, `setBackground`, `copyClip` / `readClip` / `pasteClip` (the clipboard format), `CANVAS_CLIP_TYPE` |
| **Layout** | `alignRects`, `distributeRects`, `justifyRects`, `arrangeRects`, `resizeBox`, `scaleBoxes`, `snap`, `gridSpacing`, `NODE_SIZE`, `GROUP_PADDING`, `MIN_NODE_SIZE` |
| **Geometry** | `edgeGeometry` (Obsidian's curves and arrows), `bezierPoint`, `nearestSide`, `sideTowards`, `unionBBox`, `growBBox`, `intersectsBBox`, `containsBBox`, `centerOf` |
| **View** | `fitViewport`, `zoomViewport`, `viewportBBox`, `viewportToWorld`, `clampZoom`, `MIN_ZOOM`, `MAX_ZOOM`, `ZOOM_BREAKPOINT`, `exportSize` |
| **Content** | `fileKind(path)`, `fileName`, `fileExtension`, `fileLabel`, `markdownSection(text, subpath)` (a heading's section or a block), `embedUrl(url)` (YouTube and X embeds), `canvasMinimap(canvas)` |
| **Colors** | `PRESET_COLORS`, `isPresetColor`, `normalizeColor`, `parseHexColor`, `isLightColor` |
| **History** | `CanvasHistory` (snapshots with undo/redo) |

## Keyboard and mouse

Mod is ⌘ on macOS and Ctrl elsewhere. The canvas's help dialog (the ? control) lists these with the platform's key names.

| Action | |
|---|---|
| Pan | Scroll; Space+drag; middle or right drag |
| Pan horizontally | Shift+scroll |
| Zoom | Mod+scroll, Space+scroll, pinch; the controls' + and − |
| Zoom to fit / to the selection | Shift+1 / Shift+2 |
| Select | Click; drag on empty canvas for a rectangle; Shift+click or Shift+drag to add or remove; Mod+A for all |
| Move | Drag; Shift keeps to one axis; arrow keys nudge (Shift: 5 grid steps) |
| Clone | Option+drag (macOS), Ctrl+drag (elsewhere) |
| Snap off while dragging | Hold Ctrl (macOS), Alt (elsewhere) |
| Resize | Drag an edge or corner; images and video keep their shape |
| Add a card | Double-click empty canvas; drag from the bottom bar; Mod+drag on empty canvas for a size; right-click for the add menu |
| Edit a text card | Double-click it; Escape or a click elsewhere saves |
| Fit a card to its text | Double-click its bottom or right edge |
| Connect | Drag from the dot on a card's side; drop on empty canvas to add a card there |
| Edit an edge's label | Click a selected edge, or right-click it |
| Rename a group | Double-click its label |
| Open a file | Double-click its card's name (Mod+click: in a new tab) |
| Remove | Delete or Backspace |
| Undo / redo | Mod+Z / Mod+Shift+Z or Mod+Y |
| Copy, cut, paste | Mod+C, Mod+X, Mod+V |
| Menus | Right-click a card, an edge, the selection or empty canvas |

## Development

```bash
bun install
bun run dev:prepare   # type stubs
bun run dev           # the playground, at http://localhost:3000
bun run test          # Vitest
bun run test:types    # vue-tsc
bun run lint
bun run release       # build, changelog, publish
```

The playground shows several canvases (Obsidian's demo, the spec's sample, every kind of card, unsupported data, 1,000 nodes) over the files in `test/fixtures/vault`. To use your own:

- `JC_VAULT=/path/to/vault bun run dev` serves that folder instead;
- **Open folder…** (Chromium) opens a local folder with the File System Access API: pick one of its canvases to edit; changes are saved back to the file.

Inspiration and reference implementations for rendering-only solutions: [`vue-json-canvas`](https://github.com/wujieli0207/vue-json-canvas) by wujieli0207 and [`JSON-Canvas-Viewer`](https://github.com/Hesprs/JSON-Canvas-Viewer) by Hesprs.

<!-- Badges -->
[npm-version-src]: https://img.shields.io/npm/v/@type32/jsoncanvas-editor/latest.svg?style=flat&colorA=020420&colorB=00DC82
[npm-version-href]: https://npmjs.com/package/@type32/jsoncanvas-editor

[npm-downloads-src]: https://img.shields.io/npm/dm/@type32/jsoncanvas-editor.svg?style=flat&colorA=020420&colorB=00DC82
[npm-downloads-href]: https://npm.chart.dev/@type32/jsoncanvas-editor

[license-src]: https://img.shields.io/npm/l/@type32/jsoncanvas-editor.svg?style=flat&colorA=020420&colorB=00DC82
[license-href]: https://npmjs.com/package/@type32/jsoncanvas-editor

[nuxt-src]: https://img.shields.io/badge/Nuxt-020420?logo=nuxt.js
[nuxt-href]: https://nuxt.com
