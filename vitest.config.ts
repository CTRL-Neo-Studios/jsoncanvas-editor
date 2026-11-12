import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		// Outside src/, so tests aren't built into dist/runtime.
		include: ['test/**/*.test.ts'],
	},
})
