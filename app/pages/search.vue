<script setup lang="ts">
const route = useRoute()
const requestUrl = useRequestURL()
const { applyPublic } = usePublicPageDeliveryHeaders()
const robots = useResponseHeader('X-Robots-Tag')

function queryText(value: unknown) {
  return Array.isArray(value) ? String(value[0] ?? '') : typeof value === 'string' ? value : ''
}

function queryList(value: unknown) {
  const values = Array.isArray(value) ? value : value == null ? [] : [value]
  return [...new Set(values.flatMap(entry => String(entry).split(','))
    .map(entry => entry.trim())
    .filter(Boolean))]
}

const initialQuery = computed(() => queryText(route.query.q))
const schemaKeys = computed(() => queryList(route.query.schema))
const fieldIds = computed(() => queryList(route.query.field))
const operator = computed(() => route.query.operator === 'any' ? 'any' as const : 'all' as const)
const canonicalUrl = `${requestUrl.origin}/search`

applyPublic()
robots.value = 'noindex, follow'
useSeoMeta({
  title: 'Search',
  description: 'Search published content.',
  robots: 'noindex, follow',
  ogTitle: 'Search',
  ogDescription: 'Search published content.'
})
useHead({
  link: [{ rel: 'canonical', href: canonicalUrl }]
})

async function updateQuery(query: string) {
  const nextQuery: Record<string, string> = {}
  if (query) nextQuery.q = query
  if (schemaKeys.value.length) nextQuery.schema = schemaKeys.value.join(',')
  if (fieldIds.value.length) nextQuery.field = fieldIds.value.join(',')
  if (operator.value === 'any') nextQuery.operator = 'any'
  await navigateTo({ path: '/search', query: nextQuery }, { replace: true })
}
</script>

<template>
  <UContainer class="py-10 sm:py-14">
    <UPage>
      <UPageBody>
        <PublicKeywordSearch
          :initial-query="initialQuery"
          :schema-keys="schemaKeys"
          :field-ids="fieldIds"
          :operator="operator"
          :auto-search="Boolean(initialQuery)"
          @submitted="updateQuery"
        />
      </UPageBody>
    </UPage>
  </UContainer>
</template>
