<script setup lang="ts">
/** Nuxt UI's menu needs its app config; this lists the items (submenus flattened) and behaves the same on choice. */
interface Item {
	label?: string
	onSelect?: () => void
	children?: Array<Item | Item[]>
}

const props = defineProps<{ open?: boolean, items?: Array<Item | Item[]> }>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()

/** Items and their submenus' items, groups (arrays) flattened. */
const flat = (items: Array<Item | Item[]>): Item[] => items.flat().flatMap(i => [i, ...flat(i.children ?? [])])

function choose(item: Item) {
	item.onSelect?.()
	emit('update:open', false)
}
</script>

<template>
	<slot />
	<div v-if="props.open" class="menu-stub">
		<button v-for="item in flat(items ?? [])" :key="item.label" :data-label="item.label" @click="choose(item)" />
	</div>
</template>
