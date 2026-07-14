<script setup lang="ts">
import { publicPathFromDecodedSegments, publicPathToHref } from '~~/shared/public-routing'

const route = useRoute()
const { applyPublic, applyPrivateNoindex } = usePublicPageDeliveryHeaders()
let requestedPath = ''
try {
  requestedPath = publicPathFromDecodedSegments(
    Array.isArray(route.params.path) ? route.params.path.map(String) : [String(route.params.path)]
  )
} catch {
  applyPrivateNoindex()
  throw createError({ statusCode: 404, statusMessage: 'Not Found' })
}
const { data: resolved, error } = await useFetch<any>('/api/delivery/route', { query: { path: requestedPath } })
if (error.value || !resolved.value) {
  applyPrivateNoindex()
  throw createError({ statusCode: 404, statusMessage: 'Not Found' })
}
if (resolved.value.routeKind === 'alias') {
  applyPublic()
  await navigateTo(publicPathToHref(resolved.value.canonicalPath), { redirectCode: 301 })
}
if (resolved.value.documentKind !== 'page') {
  applyPrivateNoindex()
  throw createError({ statusCode: 404, statusMessage: 'Not Found' })
}

const { data: page, error: pageError } = await useFetch<any>(() => `/api/delivery/page/${resolved.value.documentId}`)
if (pageError.value || !page.value) {
  applyPrivateNoindex()
  throw createError({ statusCode: 404, statusMessage: 'Not Found' })
}
applyPublic()
usePublicRouteSeo(computed(() => resolved.value?.seo))
</script>

<template>
  <UContainer class="py-8">
    <UPage>
      <UPageHeader :title="page?.title || 'Untitled page'" />
      <UPageBody><PageDocumentRenderer :document="page?.content" /></UPageBody>
    </UPage>
  </UContainer>
</template>
