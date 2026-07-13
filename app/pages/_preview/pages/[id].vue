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
const id = computed(() => String(route.params.id))
const { data: page, error: pageError } = await useFetch<any>(() => `/api/preview/page/${id.value}`)
const pageState = getPreviewDataState(page.value, pageError.value)
if (pageState === 'not-found' && import.meta.server) {
  const event = useRequestEvent()
  if (event) setResponseStatus(event, 404, 'Page not found')
}
</script>

<template>
  <UContainer v-if="pageState === 'ready'" class="py-8">
    <UPage>
      <UPageHeader :title="page?.title || 'Untitled page'" description="Draft preview">
        <template #headline>
          <UBadge color="warning" variant="subtle">
            Private preview
          </UBadge>
        </template>
      </UPageHeader>
      <UPageBody>
        <PageDocumentRenderer :document="page?.content" />
      </UPageBody>
    </UPage>
  </UContainer>
  <UContainer v-else class="py-16">
    <main>
      <h1 class="text-2xl font-semibold">
        Page not found
      </h1>
    </main>
  </UContainer>
</template>
