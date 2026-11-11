import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  modules: ['../src/module', '@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  devtools: { enabled: true },
  // `@type32/jsoncanvas-editor-nuxt/core` and `/vue` resolve to the sources, as they would from `dist/runtime` once installed.
  alias: { '@type32/jsoncanvas-editor-nuxt': fileURLToPath(new URL('../src/runtime', import.meta.url)) },
})
