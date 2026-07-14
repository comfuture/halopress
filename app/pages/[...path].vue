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
const isAlias = resolved.value.routeKind === 'alias'
if (isAlias) {
  applyPublic()
  await navigateTo(publicPathToHref(resolved.value.canonicalPath), { redirectCode: 301 })
}
if (!isAlias && resolved.value.documentKind !== 'page') {
  applyPrivateNoindex()
  throw createError({ statusCode: 404, statusMessage: 'Not Found' })
}

const page = ref<any>(null)
if (!isAlias) {
  const { data, error: pageError } = await useFetch<any>(() => `/api/delivery/page/${resolved.value.documentId}`)
  if (pageError.value || !data.value) {
    applyPrivateNoindex()
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }
  page.value = data.value
  applyPublic()
  usePublicRouteSeo(computed(() => resolved.value?.seo))
}
</script>

<template>
  <UContainer class="py-8">
    <UPage>
      <UPageHeader :title="page?.title || 'Untitled page'" />
      <UPageBody><PageDocumentRenderer :document="page?.content" /></UPageBody>
    </UPage>
  </UContainer>
</template>
