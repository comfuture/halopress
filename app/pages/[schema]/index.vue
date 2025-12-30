<script setup lang="ts">
import type { ButtonProps } from '@nuxt/ui'

const route = useRoute()
const router = useRouter()
const schemaKey = computed(() => String(route.params.schema))

const { data: schema } = await useFetch<any>(() => `/api/schema/${schemaKey.value}/active`)
const pageSize = computed(() => {
  const raw = Number(route.query.pageSize ?? 20)
  if (!Number.isFinite(raw)) return 20
  return Math.min(Math.max(raw, 1), 50)
})
const order = computed(() => (route.query.order === 'asc' ? 'asc' : 'desc'))
const cursor = computed(() => (typeof route.query.cursor === 'string' && route.query.cursor.length ? route.query.cursor : null))

const { items, nextCursor } = await useHalopressQuery(schemaKey, {
  status: 'published',
  pageSize,
  order,
  cursor
})
const itemLinks = computed(() =>
  items.value.map((item: any) => ({
    label: item.title || item.id,
    to: `/${schemaKey.value}/${item.id}`,
    icon: 'i-lucide-file-text'
  }))
)

const cursorStack = ref<string[]>([])
const hasPrev = computed(() => cursorStack.value.length > 0 || Boolean(cursor.value))
const hasNext = computed(() => Boolean(nextCursor.value))

const heroDescription = computed(() => {
  if (!schema.value) return `Schema ${schemaKey.value}`
  const count = items.value.length
  return `Schema v${schema.value.version} · ${count} ${count === 1 ? 'entry' : 'entries'}`
})

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
  <UContainer>
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
          <UPageList divide>
            <UPageCard
              v-for="item in items"
              :key="item.id"
              :title="item.title || item.id"
              :to="`/${schemaKey}/${item.id}`"
              icon="i-lucide-file-text"
            />
          </UPageList>

          <UAlert
            v-if="items.length === 0"
            title="Nothing published"
            description="Drafts show up here once they are published."
            icon="i-lucide-info"
            variant="subtle"
            class="mt-6"
          />

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
