<script setup lang="ts">
definePageMeta({
  layout: 'desk'
})

const { data: schemas, refresh } = await useFetch<{ items: Array<{ schemaKey: string; title?: string; activeVersion: number }> }>('/api/schema/list')
const { data: userStats } = await useFetch<{ total: number }>('/api/users/stats')
const toast = useToast()

const schemaCount = computed(() => schemas.value?.items?.length ?? 0)
const userCount = computed(() => userStats.value?.total ?? 0)
const hasSchemas = computed(() => schemaCount.value > 0)

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
      <UPageGrid class="mb-6">
        <UCard class="transition hover:bg-elevated/40">
          <NuxtLink to="/_desk/users" class="block">
            <div class="flex items-center justify-between text-sm text-muted">
              <span>Users</span>
              <UIcon name="i-lucide-users" class="text-muted" />
            </div>
            <div class="mt-3 text-3xl font-semibold">
              {{ userCount }}
            </div>
            <p class="mt-1 text-xs text-muted">Active users</p>
          </NuxtLink>
        </UCard>

        <UCard class="transition hover:bg-elevated/40">
          <NuxtLink to="/_desk/schemas" class="block">
            <div class="flex items-center justify-between">
              <span class="text-sm text-muted">Schemas</span>
              <UBadge variant="soft" color="neutral">
                {{ schemaCount }}
              </UBadge>
            </div>
            <div class="mt-3 text-3xl font-semibold">
              {{ schemaCount }}
            </div>
            <p class="mt-1 text-xs text-muted">Registered schemas</p>
          </NuxtLink>
        </UCard>
      </UPageGrid>

      <UAlert v-if="!hasSchemas" title="No schemas yet"
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
    </template>
  </UDashboardPanel>
</template>
