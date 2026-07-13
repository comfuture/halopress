<script setup lang="ts">
import { setResponseHeader } from 'h3'

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
const { data: page } = await useFetch<any>(() => `/api/preview/page/${id.value}`)
</script>

<template>
  <UContainer class="py-8">
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
</template>
