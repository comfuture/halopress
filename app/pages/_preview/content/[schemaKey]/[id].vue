<script setup lang="ts">
import type { Content } from '@tiptap/core'
import { setResponseHeader, setResponseStatus } from 'h3'

definePageMeta({
  layout: false
})

useSeoMeta({
  robots: 'noindex, nofollow, noarchive'
})

if (import.meta.server) {
  const event = useRequestEvent()
  if (event) {
    setResponseHeader(event, 'Cache-Control', 'private, no-store')
    setResponseHeader(event, 'Vary', 'Cookie')
    setResponseHeader(event, 'X-Robots-Tag', 'noindex, nofollow, noarchive')
  }
}

const route = useRoute()
const schemaKey = computed(() => String(route.params.schemaKey))
const id = computed(() => String(route.params.id))
const schemaRequest = useFetch<any>(() => `/api/schema/${schemaKey.value}/active`)
const documentRequest = useFetch<any>(() => `/api/preview/content/${schemaKey.value}/${id.value}`)
const [
  { data: schema, error: schemaError },
  { data: doc, error: documentError }
] = await Promise.all([schemaRequest, documentRequest])
const documentState = getPreviewDataState(doc.value, documentError.value)
const schemaState = documentState === 'ready'
  ? getPreviewDataState(schema.value, schemaError.value)
  : 'not-found'
const previewState = documentState === 'ready' && schemaState === 'ready' ? 'ready' : 'not-found'
if (previewState === 'not-found' && import.meta.server) {
  const event = useRequestEvent()
  if (event) setResponseStatus(event, 404, 'Content not found')
}
const fields = computed(() => (schema.value?.registry?.fields ?? []).filter((field: any) => field?.key !== 'title'))

function asEditorContent(value: unknown): Content | undefined {
  return value ? value as Content : undefined
}
</script>

<template>
  <UContainer v-if="previewState === 'ready'" class="py-8">
    <UPage>
      <UPageHeader
        :title="doc?.content?.title || doc?.id || id"
        :description="`Draft preview · ${schema?.title || schemaKey}`"
      >
        <template #headline>
          <UBadge color="warning" variant="subtle">
            Private preview
          </UBadge>
        </template>
      </UPageHeader>

      <UPageBody>
        <UPageList v-if="doc?.content && fields.length" divide>
          <UPageCard
            v-for="field in fields"
            :key="field.fieldId || field.key"
            :title="field.title || field.key"
            :description="field.kind"
            variant="subtle"
          >
            <template #body>
              <CmsRichEditor
                v-if="field.kind === 'richtext'"
                :model-value="asEditorContent(doc.content[field.key])"
                :editable="false"
                class="min-h-24 w-full"
              />
              <AssetImage
                v-else-if="field.kind === 'asset' && doc.content[field.key]"
                :src="`/assets/${doc.content[field.key]}/raw`"
                class="max-w-full rounded-md border border-muted"
                alt=""
                preset="content"
              />
              <pre v-else class="overflow-x-auto rounded-md border border-muted bg-muted/50 p-3 text-sm">{{ doc.content[field.key] }}</pre>
            </template>
          </UPageCard>
        </UPageList>

        <UAlert
          v-else
          title="Unable to render preview"
          description="The schema or working content is unavailable."
          color="warning"
          variant="subtle"
        />
      </UPageBody>
    </UPage>
  </UContainer>
  <UContainer v-else class="py-16">
    <main>
      <h1 class="text-2xl font-semibold">
        Content not found
      </h1>
    </main>
  </UContainer>
</template>
