<script setup lang="ts">
definePageMeta({
  layout: 'desk'
})

const locale = useDisplayLocale()
const { data, pending, refresh } = await useFetch<{ items: Array<{ id: string; title: string | null; status: string; createdAt: string; updatedAt: string }> }>('/api/page', {
  query: { limit: 100 }
})

const formatUpdatedAt = (value: string) => formatDateTime(value, locale.value)
</script>

<template>
  <UDashboardPanel id="desk-pages">
    <template #header>
      <DeskNavbar title="Pages" description="Standalone pages built with PageEditor.">
        <template #actions>
          <UButton icon="i-lucide-plus" color="primary" to="/_desk/pages/new">
            New Page
          </UButton>
        </template>
      </DeskNavbar>
    </template>

    <template #body>
      <UPageGrid>
        <UCard
          v-for="page in (data?.items || [])"
          :key="page.id"
          :ui="{ root: 'overflow-hidden', body: 'p-4', footer: 'p-3 sm:p-4' }"
        >
          <template #default>
            <NuxtLink :to="`/_desk/pages/${page.id}`" class="block">
              <div class="text-base font-semibold truncate">
                {{ page.title || 'Untitled Page' }}
              </div>
              <div class="text-xs text-muted mt-1">
                Updated {{ formatUpdatedAt(page.updatedAt) }}
              </div>
            </NuxtLink>
          </template>

          <template #footer>
            <div class="flex items-center justify-between">
              <UBadge variant="soft">
                {{ page.status }}
              </UBadge>
              <UButton
                color="neutral"
                variant="ghost"
                size="sm"
                icon="i-lucide-refresh-cw"
                :loading="pending"
                @click="refresh()"
              />
            </div>
          </template>
        </UCard>
      </UPageGrid>
    </template>
  </UDashboardPanel>
</template>
