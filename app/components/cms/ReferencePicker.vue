<script setup lang="ts">
const props = defineProps<{
  modelValue: string | null | undefined
  targetSchemaKey?: string | null
  label?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: string | null): void
}>()

const open = ref(false)
const selected = ref<string | null>(props.modelValue ?? null)

watch(() => props.modelValue, (v) => {
  selected.value = v ?? null
})

const fetchUrl = computed(() => props.targetSchemaKey ? `/api/content/${props.targetSchemaKey}` : '/api/content/__none__')
const { data: list, refresh } = await useFetch<{ items: any[] }>(fetchUrl, {
  immediate: false,
  query: { limit: 50 }
})

watch(() => props.targetSchemaKey, async (v) => {
  if (v) await refresh()
}, { immediate: true })

const options = computed(() => (list.value?.items ?? []).map((c: any) => ({
  label: c.title || c.id,
  value: c.id
})))

function apply() {
  emit('update:modelValue', selected.value)
  open.value = false
}
</script>

<template>
  <div class="space-y-2">
    <div class="flex items-center justify-between">
      <span class="text-sm font-medium">{{ label || 'Reference' }}</span>
      <UButton
        size="xs"
        color="neutral"
        variant="outline"
        icon="i-lucide-search"
        :disabled="!targetSchemaKey"
        @click="open = true"
      >
        Browse
      </UButton>
    </div>

    <UInput
      :model-value="modelValue || ''"
      placeholder="Target ID"
      @update:model-value="emit('update:modelValue', $event || null)"
    />

    <UModal v-model:open="open">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <span class="font-medium">Pick {{ targetSchemaKey }}</span>
            <UButton icon="i-lucide-x" color="neutral" variant="ghost" @click="open = false" />
          </div>
        </template>

        <UFormField label="Select">
          <USelectMenu v-model="selected" value-key="value" :items="options" />
        </UFormField>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="outline" @click="open = false">
              Cancel
            </UButton>
            <UButton icon="i-lucide-check" @click="apply">
              Apply
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>
