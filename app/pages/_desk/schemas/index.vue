<script setup lang="ts">
definePageMeta({
  layout: 'desk'
})

const { data, status } = await useFetch<{
  items: Array<{ schemaKey: string; title?: string; activeVersion: number }>
}>('/api/schema/list')

const items = computed(() => data.value?.items ?? [])
const showEmpty = computed(() => status.value === 'success' && items.value.length === 0)
</script>

<template>
  <UDashboardPanel id="desk-schemas">
    <template #header>
      <DeskNavbar title="Schemas" description="Publish immutable versions and switch active schema.">
        <template #actions>
          <UButton to="/_desk/schemas/new" icon="i-lucide-plus" aria-label="New schema">
            <span class="hidden sm:inline">New schema</span>
          </UButton>
        </template>
      </DeskNavbar>
    </template>

    <template #body>
      <UEmpty
        v-if="showEmpty"
        class="min-h-[50vh]"
        icon="i-lucide-braces"
        title="No schemas yet"
        description="Create your first schema to publish immutable versions and switch the active schema."
        variant="naked"
      >
        <template #actions>
          <UButton to="/_desk/schemas/new" icon="i-lucide-plus">
            Create schema
          </UButton>
        </template>
      </UEmpty>

      <UPageGrid v-else>
        <UPageCard
          v-for="s in items"
          :key="s.schemaKey"
          :title="s.title || s.schemaKey"
          :description="`active v${s.activeVersion}`"
          :to="`/_desk/schemas/${s.schemaKey}`"
          icon="i-lucide-braces"
        />
      </UPageGrid>
    </template>
  </UDashboardPanel>
</template>
