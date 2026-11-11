// @ts-check
import { createConfigForNuxt } from '@nuxt/eslint-config/flat'

export default createConfigForNuxt({
	features: {
		// Rules for module authors
		tooling: true,
	},
	// Nuxt 4 layout: the playground's pages live in `app/` (single-word page names are fine there).
	dirs: {
		src: ['./playground/app'],
	},
})
