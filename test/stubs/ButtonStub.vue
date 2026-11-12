<script setup lang="ts">
/** Nuxt UI's button needs its app config; a plain button with the same label, disabled state and listeners. */
defineProps<{ label?: string, icon?: string, disabled?: boolean }>()
</script>

<template>
	<button type="button" :disabled="disabled">
		{{ label }}<slot />
	</button>
</template>
