<script setup lang="ts">
import { inject, shallowRef, watch } from 'vue'
import { MarkdownDocument } from '@comark/vue'
import type { MarkdownDocument as Parsed } from 'comark'
import { CANVAS_CONTENT } from '../composables/useCanvasContent'
import { parseMarkdown } from '../utils/markdown'

/** Markdown as a card shows it. Wiki-links go to `host.openLink`, other links open in a new tab. */
const props = defineProps<{ text: string }>()
const content = inject(CANVAS_CONTENT)!

const doc = shallowRef<Parsed>()
watch(() => props.text, async (text) => {
	const parsed = await parseMarkdown(text)
	if (text === props.text) doc.value = parsed
}, { immediate: true })

function onClick(e: MouseEvent) {
	const a = (e.target as Element).closest<HTMLAnchorElement>('a[href]')
	if (!a) return
	e.preventDefault()
	if (a.dataset.wikilink !== undefined) content.host()?.openLink?.(a.dataset.wikilink)
	else window.open(a.href, '_blank', 'noopener,noreferrer')
}
</script>

<template>
	<div class="jc-markdown" @click="onClick">
		<!-- Comark's renderer has an async setup: its own Suspense, so it renders without one around the canvas. -->
		<Suspense>
			<MarkdownDocument v-if="doc" :value="doc" />
		</Suspense>
	</div>
</template>
