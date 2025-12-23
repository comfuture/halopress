<script setup lang="ts">
const route = useRoute()
const schemaKey = computed(() => String(route.params.schema))

const { data: schema } = await useFetch<any>(() => `/api/schema/${schemaKey.value}/active`)
const { data: list } = await useFetch<any>(() => `/api/content/${schemaKey.value}`, {
  query: { status: 'published', limit: 50 }
})
</script>

<template>
  <div class="space-y-6">
    <UPageHeader
      :title="schema?.title || schemaKey"
      :description="schema ? `Schema v${schema.version}` : ''"
    />

    <UPageList>
      <UPageCard
        v-for="item in (list?.items || [])"
        :key="item.id"
        :title="item.title || item.id"
        :to="`/${schemaKey}/${item.id}`"
        icon="i-lucide-file-text"
      />
    </UPageList>
  </div>
</template>
