<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

withDefaults(defineProps<{
  previewTo?: string
  previewLabel?: string
  canSaveDraft: boolean
  savingDraft: boolean
  canPublish: boolean
  publishing: boolean
  menuItems?: DropdownMenuItem[][]
  menuLoading?: boolean
}>(), {
  previewTo: undefined,
  previewLabel: 'Preview draft',
  menuItems: () => [],
  menuLoading: false
})

defineEmits<{
  saveDraft: []
  publish: []
}>()

const previewOpen = ref(false)

function openPreview() {
  previewOpen.value = true
}
</script>

<template>
  <UTooltip v-if="previewTo" :text="previewLabel">
    <UButton
      color="neutral"
      variant="ghost"
      icon="i-lucide-eye"
      square
      :aria-label="previewLabel"
      @click="openPreview"
    />
  </UTooltip>

  <UModal
    v-if="previewTo"
    v-model:open="previewOpen"
    fullscreen
    :title="previewLabel"
    description="Private preview"
    :ui="{ body: 'p-0 overflow-hidden' }"
  >
    <template #body>
      <iframe
        :src="previewTo"
        :title="previewLabel"
        class="block h-full min-h-0 w-full border-0 bg-default"
      />
    </template>
  </UModal>

  <UTooltip text="Save Draft">
    <UButton
      color="neutral"
      variant="outline"
      icon="i-lucide-save"
      square
      :loading="savingDraft"
      :disabled="!canSaveDraft"
      aria-label="Save Draft"
      @click="$emit('saveDraft')"
    />
  </UTooltip>

  <UButton
    color="primary"
    icon="i-lucide-upload"
    label="Publish"
    :loading="publishing"
    :disabled="!canPublish"
    @click="$emit('publish')"
  />

  <UDropdownMenu
    v-if="menuItems.length"
    :items="menuItems"
    :content="{ align: 'end' }"
    :ui="{ content: 'w-48' }"
  >
    <UTooltip text="More actions">
      <UButton
        color="neutral"
        variant="ghost"
        icon="i-lucide-ellipsis-vertical"
        square
        :loading="menuLoading"
        aria-label="More actions"
      />
    </UTooltip>
  </UDropdownMenu>
</template>
