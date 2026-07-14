<script setup lang="ts">
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
        <PublicContentDetailRenderer v-if="doc?.content" :schema="schema" :content="doc.content" :fallback-title="doc?.id || id" />

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
