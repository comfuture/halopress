<script setup lang="ts">
const pageTitle = defineModel<string>('pageTitle', { default: '' })
const publicPath = defineModel<string>('publicPath', { default: '' })
const description = defineModel<string>('description', { default: '' })
const socialImageAssetId = defineModel<string>('socialImageAssetId', { default: '' })

defineProps<{
  disabled?: boolean
}>()

const socialImageAsset = computed<string | null>({
  get: () => socialImageAssetId.value || null,
  set: value => { socialImageAssetId.value = value || '' }
})
</script>

<template>
  <section aria-label="Page properties" class="flex h-full min-h-0 flex-col">
    <div class="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
      <UFormField label="Title">
        <UInput v-model="pageTitle" placeholder="Page title" class="w-full" :disabled="disabled" />
      </UFormField>

      <UFormField
        label="Description"
        help="Used by search engines and social previews when available."
      >
        <UTextarea
          v-model="description"
          placeholder="Describe this page"
          class="w-full"
          :rows="3"
          :maxlength="320"
          autoresize
          :disabled="disabled"
        />
      </UFormField>

      <UFormField
        label="Canonical path"
        help="Optional canonical route for this page, such as /about."
      >
        <UInput v-model="publicPath" placeholder="/page-path" class="w-full" :disabled="disabled" />
      </UFormField>

      <div class="space-y-1">
        <CmsAssetPicker
          v-model="socialImageAsset"
          label="Social image"
          :disabled="disabled"
        />
        <p class="text-xs text-muted">
          Used for link previews such as og:image.
        </p>
      </div>
    </div>
  </section>
</template>
