import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
	plugins: [vue()],
	resolve: {
		alias: {
			// Nuxt UI's icon needs its Vite plugin; tests don't look at icons.
			'@nuxt/ui/components/Icon.vue': fileURLToPath(new URL('./test/stubs/IconStub.vue', import.meta.url)),
		},
	},
	test: {
		// Outside src/, so tests aren't built into dist/runtime.
		include: ['test/**/*.test.ts'],
	},
})
