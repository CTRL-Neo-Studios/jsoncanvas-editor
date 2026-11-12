<script setup lang="ts">
import { computed, ref } from 'vue'
import UButton from '@nuxt/ui/components/Button.vue'
import UInput from '@nuxt/ui/components/Input.vue'
import UModal from '@nuxt/ui/components/Modal.vue'
import type { CanvasPrompt } from '../composables/useCanvasInteraction'

/** Asks for a value (a link card's URL); closing without submitting changes nothing. */
const props = defineProps<{ prompt: CanvasPrompt }>()
const emit = defineEmits<{ close: [] }>()

const value = ref(props.prompt.value)
const touched = ref(false)
const error = computed(() => (touched.value ? props.prompt.validate(value.value) : undefined))

function submit() {
	touched.value = true
	if (error.value) return
	props.prompt.submit(value.value)
	emit('close')
}
</script>

<template>
	<UModal :open="true" :title="prompt.title" @update:open="open => open || emit('close')">
		<template #body>
			<form @submit.prevent="submit">
				<UInput v-model="value" autofocus class="jc-prompt-input" :color="error ? 'error' : undefined" @update:model-value="touched = false" />
				<p v-if="error" class="jc-prompt-error">
					{{ error }}
				</p>
			</form>
		</template>
		<template #footer>
			<UButton label="Cancel" color="neutral" variant="ghost" @click="emit('close')" />
			<UButton label="Save" @click="submit" />
		</template>
	</UModal>
</template>
