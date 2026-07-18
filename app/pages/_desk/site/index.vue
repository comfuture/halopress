<script setup lang="ts">
definePageMeta({ layout: 'desk' })

const { data: presentation, pending, error, refresh } = useSitePresentationStatus()
const { data: menuData, pending: menusPending, error: menusError } = useSiteMenusStatus()

const presentationStatus = computed(() => {
  if (presentation.value?.malformedStoredValue) return { label: 'Needs repair', color: 'warning' as const }
  if (presentation.value?.configured) return { label: 'Configured', color: 'success' as const }
  return { label: 'Built-in defaults', color: 'info' as const }
})

const menuSetCount = computed(() => menuData.value?.items.length ?? 0)
const menuLinkCount = computed(() => (menuData.value?.items ?? []).reduce((total, menu) => (
  total + menu.document.items.reduce((count, item) => count + 1 + item.children.length, 0)
), 0))
</script>

<template>
  <SiteAdminSection
    section="overview"
    title="Site"
    description="Review Site status and manage Themes, Layouts, and Menus."
  >
    <div
      v-if="pending"
      class="space-y-4"
      aria-busy="true"
      aria-label="Loading Site overview"
    >
      <USkeleton class="h-24 w-full" />
      <div class="grid gap-4 md:grid-cols-3">
        <USkeleton v-for="index in 3" :key="index" class="h-44 w-full" />
      </div>
    </div>

    <div v-else class="space-y-6">
      <UAlert
        title="Site administration is enabled"
        description="Desk tools are available. Public pages continue to use the current presentation contract until a HaloPress Layout is explicitly created and selected."
        color="success"
        variant="subtle"
        icon="i-lucide-circle-check"
      />

      <UAlert
        v-if="error"
        title="Presentation status is unavailable"
        :description="error.statusMessage || 'Refresh the status and try again.'"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
      >
        <template #actions>
          <UButton color="neutral" variant="outline" icon="i-lucide-rotate-cw" :loading="pending" @click="refresh()">
            Refresh status
          </UButton>
        </template>
      </UAlert>

      <div class="grid gap-4 md:grid-cols-3">
        <UPageCard
          title="Themes"
          description="Prepare reusable visual tokens for independently rendered content."
          icon="i-lucide-palette"
          to="/_desk/site/themes"
          variant="outline"
        >
          <template #footer>
            <div class="flex w-full items-center justify-between gap-3">
              <UBadge :color="presentationStatus.color" variant="soft">
                {{ presentationStatus.label }}
              </UBadge>
              <span class="text-xs text-muted">Active presentation</span>
            </div>
          </template>
        </UPageCard>

        <UPageCard
          title="Layouts"
          description="Define HaloPress page-layout resources for public rendering."
          icon="i-lucide-panels-top-left"
          to="/_desk/site/layouts"
          variant="outline"
        >
          <template #footer>
            <div class="flex w-full items-center justify-between gap-3">
              <UBadge color="neutral" variant="soft">
                Not available yet
              </UBadge>
              <span class="text-xs text-muted">Default Layout: none</span>
            </div>
          </template>
        </UPageCard>

        <UPageCard
          title="Menus"
          description="Build reusable static and dynamic navigation sets."
          icon="i-lucide-menu"
          to="/_desk/site/menus"
          variant="outline"
        >
          <template #footer>
            <div class="flex w-full items-center justify-between gap-3">
              <UBadge :color="menusError ? 'warning' : 'success'" variant="soft">
                {{ menusPending ? 'Loading' : menusError ? 'Unavailable' : `${menuSetCount} menu ${menuSetCount === 1 ? 'set' : 'sets'}` }}
              </UBadge>
              <span class="text-xs text-muted">
                {{ menuLinkCount }} saved {{ menuLinkCount === 1 ? 'link' : 'links' }}
              </span>
            </div>
          </template>
        </UPageCard>
      </div>
    </div>
  </SiteAdminSection>
</template>
