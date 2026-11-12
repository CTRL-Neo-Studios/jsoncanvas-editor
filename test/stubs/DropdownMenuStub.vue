<script setup lang="ts">
/** Nuxt UI's menu needs its app config; this lists the items (submenus flattened) and behaves the same on choice. */
interface Item {
	label?: string
	onSelect?: () => void
	children?: Item[]
}

const props = defineProps<{ open?: boolean, items?: Item[][] }>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()

const flat = (items: Item[]): Item[] => items.flatMap(i => [i, ...flat(i.children ?? [])])

function choose(item: Item) {
	item.onSelect?.()
	emit('update:open', false)
}
</script>

<template>
	<div v-if="props.open" class="menu-stub">
		<button v-for="item in flat((items ?? []).flat())" :key="item.label" :data-label="item.label" @click="choose(item)" />
	</div>
</template>
