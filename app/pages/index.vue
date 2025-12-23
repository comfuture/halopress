<script setup lang="ts">
const { data } = await useFetch<{ items: Array<{ schemaKey: string; title?: string; activeVersion: number }> }>('/api/schema/list')
const schemas = computed(() => data.value?.items ?? [])
</script>

<template>
  <div class="space-y-8">
    <UPageHeader
      title="Halopress"
      description="Multi-schema CMS (MVP)"
      :links="[
        { label: 'Open Desk', to: '/_desk', icon: 'i-lucide-layout-dashboard' }
      ]"
    />

    <UPageSection
      title="Collections"
      description="Active schemas published in this tenant."
    >
      <UPageGrid>
        <UPageCard
          v-for="s in schemas"
          :key="s.schemaKey"
          :title="s.title || s.schemaKey"
          :description="`v${s.activeVersion}`"
          :to="`/${s.schemaKey}/`"
          icon="i-lucide-folder"
        />
      </UPageGrid>

      <UAlert
        v-if="schemas.length === 0"
        title="No schemas published yet"
        description="Go to Desk → Schemas to publish your first schema."
        icon="i-lucide-info"
        variant="subtle"
        class="mt-6"
      />
    </UPageSection>
  </div>
</template>
