<script setup lang="ts">
const pageTitle = defineModel<string>('pageTitle', { default: '' })
const publicPath = defineModel<string>('publicPath', { default: '' })
const seoTitle = defineModel<string>('seoTitle', { default: '' })
const seoDescription = defineModel<string>('seoDescription', { default: '' })
const seoImageAssetId = defineModel<string>('seoImageAssetId', { default: '' })
const structuredDataType = defineModel<string>('structuredDataType', { default: '' })

defineProps<{
  disabled?: boolean
  description?: string
  validationMessage?: string
}>()
</script>

<template>
  <section aria-label="Page properties" class="flex h-full min-h-0 flex-col">
    <div class="border-b border-muted px-4 py-3">
      <h2 class="text-sm font-semibold text-highlighted">Page properties</h2>
      <p class="mt-1 text-xs text-muted">
        {{ description || 'Edit page details, its public route, and search metadata.' }}
      </p>
    </div>

    <div class="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
      <UAlert
        v-if="validationMessage"
        title="This page is not ready to publish"
        :description="validationMessage"
        icon="i-lucide-triangle-alert"
        color="error"
        variant="subtle"
      />

      <UFormField label="Title">
        <UInput v-model="pageTitle" placeholder="Page title" class="w-full" :disabled="disabled" />
      </UFormField>

      <CmsPublicMetadataFields
        v-model:public-path="publicPath"
        v-model:title="seoTitle"
        v-model:description="seoDescription"
        v-model:image-asset-id="seoImageAssetId"
        v-model:structured-data-type="structuredDataType"
        show-path
        compact
        :disabled="disabled"
      />
    </div>
  </section>
</template>
