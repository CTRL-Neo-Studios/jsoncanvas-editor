<script setup lang="ts">
import { fileName, type JSONCanvasFileNode } from '@type32/jsoncanvas-editor/core'
import type { CanvasHost, ResolvedFile } from '@type32/jsoncanvas-editor/vue'

/** Draws an Obsidian `.base` file card: its views, the one named by `#subpath` highlighted. */
const props = defineProps<{ node: JSONCanvasFileNode, file: ResolvedFile, host?: CanvasHost }>()

interface BaseView { type: string, name: string }

/** The `type` and `name` of each item under the top-level `views:` key; line-based, not a YAML parser. */
function parseViews(text: string): BaseView[] {
	const views: BaseView[] = []
	let inViews = false, indent = -1
	for (const line of text.split('\n')) {
		if (/^[^\s-]/.test(line)) {
			inViews = line.startsWith('views:')
			indent = -1
			continue
		}
		const m = inViews && /^( *)(- )?(\w+):(.*)$/.exec(line)
		if (!m) continue
		const [, space = '', dash, key, rest = ''] = m
		const value = rest.trim()
		if (dash && (indent < 0 || space.length === indent)) {
			indent = space.length
			views.push({ type: '', name: '' })
		}
		else if (indent < 0 || space.length !== indent + 2) continue
		if (key === 'type' || key === 'name') views.at(-1)![key] = value.replace(/^(["'])(.*)\1$/, '$2')
	}
	return views
}

const views = ref<BaseView[]>([])
watch(() => props.node.file, async (file) => {
	views.value = parseViews(await Promise.resolve(props.host?.readText?.(file) ?? '').catch(() => ''))
}, { immediate: true })
</script>

<template>
	<div class="h-full overflow-auto bg-default text-sm">
		<div class="sticky top-0 px-3 py-2 font-medium bg-default border-b border-default">
			{{ fileName(node.file) }}
		</div>
		<div
			v-for="(view, i) in views"
			:key="i"
			class="px-3 py-1.5 border-b border-default"
			:class="node.subpath === `#${view.name}` ? 'bg-elevated text-highlighted font-medium' : 'text-muted'"
		>
			{{ view.type || 'view' }} · {{ view.name || 'Untitled' }}
		</div>
		<div v-if="!views.length" class="px-3 py-2 text-dimmed">
			No views
		</div>
	</div>
</template>
