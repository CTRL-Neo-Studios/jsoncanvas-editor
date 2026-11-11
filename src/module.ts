import { addComponent, createResolver, defineNuxtModule } from '@nuxt/kit'

/** Registers `<JsonCanvasEditor>` and its stylesheet. The host must also install `@nuxt/ui`. */
export default defineNuxtModule({
	meta: {
		name: '@type32/jsoncanvas-editor-nuxt',
		configKey: 'jsonCanvasEditor',
	},
	setup(_options, nuxt) {
		const { resolve } = createResolver(import.meta.url)

		// First, so the host's own CSS overrides it.
		nuxt.options.css.unshift(resolve('./runtime/style.css'))
		addComponent({
			name: 'JsonCanvasEditor',
			filePath: resolve('./runtime/vue/components/JsonCanvasEditor.vue'),
		})
	},
})
