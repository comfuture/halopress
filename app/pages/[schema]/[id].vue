<script setup lang="ts">
import { PUBLIC_PAGE_ROUTE_PREFIX } from '~~/shared/public-routing'

definePageMeta({ key: route => `${String(route.params.schema)}/${String(route.params.id)}` })

const route = useRoute()
const schemaKey = computed(() => String(route.params.schema))
const id = computed(() => String(route.params.id))

const standalonePage = ref<any>(null)
if (schemaKey.value === PUBLIC_PAGE_ROUTE_PREFIX) {
  const { data, error } = await useFetch<any>(() => `/api/delivery/page/${id.value}`)
  const statusCode = Number((error.value as any)?.statusCode ?? (error.value as any)?.status ?? 0)
  if (error.value && statusCode !== 404) throw createError({ statusCode: statusCode || 500, statusMessage: 'Unable to load page' })
  standalonePage.value = data.value
}

const doc = ref<any>(null)
const schema = ref<any>(null)
if (!standalonePage.value) {
  const { data: permission, error: permissionError } = await useFetch<{ canRead: boolean }>(
    () => `/api/schema/${schemaKey.value}/permission`,
    { server: true }
  )
  if (permissionError.value || !permission.value?.canRead) throw createError({ statusCode: 404, statusMessage: 'Not Found' })

  const result = await useHalopressContent(schemaKey, {
    id,
    status: 'published',
    respectStandalonePageClaim: schemaKey.value === PUBLIC_PAGE_ROUTE_PREFIX
  })
  if (result.error.value || !result.content.value) throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  doc.value = result.content.value
  schema.value = result.schema.value
}

const content = computed<Record<string, unknown>>(() => doc.value?.content ?? doc.value?.extra ?? {})
useSeoMeta({ title: () => standalonePage.value?.title || doc.value?.title || undefined })
</script>

<template>
  <UContainer v-if="standalonePage" class="py-8">
    <UPage>
      <UPageHeader :title="standalonePage.title || 'Untitled page'" />
      <UPageBody><PageDocumentRenderer :document="standalonePage.content" /></UPageBody>
    </UPage>
  </UContainer>

  <UContainer v-else class="py-10 sm:py-14">
    <PublicContentDetailRenderer :schema="schema" :content="content" :fallback-title="doc?.title || doc?.id || id" />
  </UContainer>
</template>
