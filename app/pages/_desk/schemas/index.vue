<script setup lang="ts">
definePageMeta({
  layout: 'desk'
})

const { data: session } = useAuth()
const schemaListUrl = computed(() => session.value?.user?.role === 'admin'
  ? '/api/schema/list?includeInactive=1'
  : '/api/schema/list')

const { data, status } = await useFetch<{
  items: Array<{ schemaKey: string; title?: string; activeVersion: number; status: 'active' | 'inactive' }>
}>(schemaListUrl)

const items = computed(() => data.value?.items ?? [])
const showEmpty = computed(() => status.value === 'success' && items.value.length === 0)
</script>

<template>
  <UDashboardPanel id="desk-schemas">
    <template #header>
      <DeskNavbar title="Schemas" description="Define the content types and fields your team can publish.">
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
        description="Create a schema to define the fields your editors will use."
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
          :description="s.status === 'inactive' ? `Version ${s.activeVersion} is retained but unavailable` : `Version ${s.activeVersion} is live`"
          :to="`/_desk/schemas/${s.schemaKey}`"
          icon="i-lucide-braces"
          :highlight="s.status === 'inactive'"
          highlight-color="warning"
        >
          <template #footer>
            <UBadge
              :color="s.status === 'inactive' ? 'warning' : 'success'"
              variant="soft"
              size="sm"
              :label="s.status === 'inactive' ? 'Inactive' : 'Active'"
            />
          </template>
        </UPageCard>
      </UPageGrid>
    </template>
  </UDashboardPanel>
</template>
