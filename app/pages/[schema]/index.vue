<script setup lang="ts">
import type { ButtonProps } from '@nuxt/ui'
import { PUBLIC_PAGE_ROUTE_PREFIX, publicPathFromDecodedSegments, publicPathToHref } from '~~/shared/public-routing'
import { resolveSchemaPresentation } from '~/utils/schema-presentation'

const route = useRoute()
const router = useRouter()
const { applyPublic, applyPrivateNoindex } = usePublicPageDeliveryHeaders()
let requestedPath = ''
try {
  requestedPath = publicPathFromDecodedSegments([String(route.params.schema)])
} catch {
  applyPrivateNoindex()
  throw createError({ statusCode: 404, statusMessage: 'Not Found' })
}
const routeResult = await useFetch<any>('/api/delivery/route', { query: { path: requestedPath } })
if (routeResult.error.value || !routeResult.data.value) {
  applyPrivateNoindex()
  throw createError({ statusCode: 404, statusMessage: 'Not Found' })
}
const resolvedRoute = routeResult.data.value
if (resolvedRoute?.routeKind === 'alias') {
  applyPublic()
  await navigateTo(publicPathToHref(resolvedRoute.canonicalPath), { redirectCode: 301 })
}
if (!['schema', 'page'].includes(resolvedRoute.documentKind)) {
  applyPrivateNoindex()
  throw createError({ statusCode: 404, statusMessage: 'Not Found' })
}
const schemaKey = computed(() => String(resolvedRoute.documentId))

const standalonePage = ref<any>(null)
if (resolvedRoute?.documentKind === 'page') {
  const { data, error } = await useFetch<any>(() => `/api/delivery/page/${resolvedRoute.documentId}`)
  if (error.value || !data.value) {
    applyPrivateNoindex()
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }
  standalonePage.value = data.value
}

const schema = ref<any>(null)
if (!standalonePage.value) {
  const result = await useFetch<any>(() => `/api/schema/${schemaKey.value}/active`)
  if (result.error.value || !result.data.value) {
    applyPrivateNoindex()
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }
  schema.value = result.data.value
}
const pageSize = computed(() => {
  const raw = Number(route.query.pageSize ?? 20)
  if (!Number.isFinite(raw)) return 20
  return Math.min(Math.max(raw, 1), 50)
})
const order = computed(() => (route.query.order === 'asc' ? 'asc' : 'desc'))
const cursor = computed(() => (typeof route.query.cursor === 'string' && route.query.cursor.length ? route.query.cursor : null))

const { items, nextCursor, error: contentError } = standalonePage.value
  ? { items: ref<any[]>([]), nextCursor: ref<string | null>(null), error: ref(null) }
  : await useHalopressQuery(schemaKey, {
  status: 'published',
  pageSize,
  order,
  cursor,
  respectStandalonePageClaims: computed(() => schemaKey.value === PUBLIC_PAGE_ROUTE_PREFIX)
})
if (contentError.value) {
  applyPrivateNoindex()
  throw createError({ statusCode: 404, statusMessage: 'Not Found' })
}
const itemLinks = computed(() =>
  items.value.map((item: any) => ({
    label: item.title || item.id,
    to: item.publicPath || `/${schemaKey.value}/${item.id}`,
    icon: 'i-lucide-file-text'
  }))
)
const presentation = computed(() => resolveSchemaPresentation(schema.value?.registry))

const cursorStack = ref<string[]>([])
const hasPrev = computed(() => cursorStack.value.length > 0 || Boolean(cursor.value))
const hasNext = computed(() => Boolean(nextCursor.value))

const heroDescription = computed(() => {
  const count = items.value.length
  return schema.value?.ast?.description || `${count} published ${count === 1 ? 'entry' : 'entries'}`
})
applyPublic()
usePublicRouteSeo(computed(() => resolvedRoute?.seo))

const heroLinks = [
  { label: 'Back to Schemas', to: '/', variant: 'outline' },
  { label: 'Open Desk', to: '/_desk', color: 'primary' }
] satisfies ButtonProps[]

function normalizeQuery(overrides: Record<string, string | number | undefined | null>) {
  const next = { ...route.query, ...overrides } as Record<string, any>
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined || value === null || value === '') delete next[key]
  }
  return next
}

function goNext() {
  if (!nextCursor.value) return
  cursorStack.value.push(cursor.value ?? '')
  router.replace({ query: normalizeQuery({ cursor: nextCursor.value, pageSize: pageSize.value, order: order.value }) })
}

function goPrev() {
  const prev = cursorStack.value.pop()
  if (prev !== undefined) {
    router.replace({ query: normalizeQuery({ cursor: prev || undefined, pageSize: pageSize.value, order: order.value }) })
    return
  }
  if (cursor.value) {
    router.replace({ query: normalizeQuery({ cursor: undefined, pageSize: pageSize.value, order: order.value }) })
  }
}
</script>

<template>
  <UContainer v-if="standalonePage" class="py-8">
    <UPage>
      <UPageHeader :title="standalonePage.title || 'Untitled page'" />
      <UPageBody><PageDocumentRenderer :document="standalonePage.content" /></UPageBody>
    </UPage>
  </UContainer>

  <UContainer v-else>
    <UPage class="space-y-8">
      <template #left>
        <UPageAside>
          <UPageLinks title="Entries" :links="itemLinks" />
          <UAlert
            v-if="itemLinks.length === 0"
            title="No entries yet"
            description="Publish your first entry in Desk."
            icon="i-lucide-info"
            variant="subtle"
            class="mt-4"
          />
        </UPageAside>
      </template>
      <template #right />

      <UPageBody>
        <UPageHero
          headline="Collection"
          :title="schema?.title || schemaKey"
          :description="heroDescription"
          :links="heroLinks"
        />

        <UPageSection title="Published entries" description="Recently published content for this schema.">
          <PublicContentCollectionRenderer :items="items" :schema-key="schemaKey" :template="presentation.collectionTemplate" />

          <div class="mt-8 flex items-center justify-between">
            <UButton
              icon="i-lucide-arrow-left"
              variant="outline"
              color="neutral"
              :disabled="!hasPrev"
              @click="goPrev"
            >
              Previous
            </UButton>
            <UButton
              trailing-icon="i-lucide-arrow-right"
              :disabled="!hasNext"
              @click="goNext"
            >
              Next
            </UButton>
          </div>
        </UPageSection>
      </UPageBody>
    </UPage>
  </UContainer>
</template>
