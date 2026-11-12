<script setup lang="ts">
/** Nuxt UI's tooltip needs its app config; tests only need what it wraps. */
defineProps<{ text?: string, content?: object }>()
</script>

<template>
	<slot />
</template>
