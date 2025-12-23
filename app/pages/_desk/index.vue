<script setup lang="ts">
definePageMeta({
  layout: 'desk'
})

const { data: schemas, refresh } = await useFetch<{ items: Array<{ schemaKey: string; title?: string; activeVersion: number }> }>('/api/schema/list')
const toast = useToast()

const hasSchemas = computed(() => (schemas.value?.items?.length ?? 0) > 0)

async function bootstrap() {
  try {
    await $fetch('/api/system/bootstrap', { method: 'POST' })
    toast.add({ title: 'Bootstrapped', description: 'Default Article schema created.' })
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Bootstrap failed', description: e?.statusMessage || 'Error', color: 'error' })
  }
}
</script>

<template>
  <UDashboardPanel id="desk-home">
    <template #header>
      <DeskNavbar title="Dashboard" description="Manage schemas, content, and assets.">
      </DeskNavbar>
    </template>

    <template #body>
      <UAlert v-if="!hasSchemas" title="No active schemas"
        description="Create your first schema or bootstrap a default Article schema." icon="i-lucide-sparkles"
        variant="subtle">
        <template #actions>
          <UButton to="/_desk/schemas/new" icon="i-lucide-plus">
            New schema
          </UButton>
          <UButton color="neutral" variant="outline" icon="i-lucide-wand-2" @click="bootstrap">
            Bootstrap
          </UButton>
        </template>
      </UAlert>

      <UCard v-else>
        <template #header>
          <div class="flex items-center justify-between">
            <span class="font-medium">Active Schemas</span>
            <UButton to="/_desk/schemas/new" icon="i-lucide-plus" size="sm">
              New
            </UButton>
          </div>
        </template>
        <UPageGrid>
          <UPageCard v-for="s in (schemas?.items || [])" :key="s.schemaKey" :title="s.title || s.schemaKey"
            :description="`active v${s.activeVersion}`" :to="`/_desk/content/${s.schemaKey}`" icon="i-lucide-files">
            <template #footer>
              <div class="flex gap-2">
                <UButton size="xs" color="neutral" variant="outline" :to="`/_desk/schemas/${s.schemaKey}`">
                  Edit schema
                </UButton>
                <UButton size="xs" color="neutral" variant="outline" :to="`/${s.schemaKey}/`">
                  View
                </UButton>
              </div>
            </template>
          </UPageCard>
        </UPageGrid>
      </UCard>
    </template>
  </UDashboardPanel>
</template>
