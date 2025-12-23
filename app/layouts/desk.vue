<script setup lang="ts">
const route = useRoute()

const { data: me } = await useFetch('/api/auth/me')
const { data: schemaList } = await useFetch<{ items: any[] }>('/api/schema/list')

const activeContentBase = computed(() => {
  const parts = route.path.split('/').filter(Boolean)
  if (parts[0] !== '_desk' || parts[1] !== 'content') return null
  const schemaKey = parts[2]
  if (!schemaKey) return '/_desk/content'
  return `/_desk/content/${schemaKey}`
})

const isSchemasRoute = computed(() => route.path === '/_desk/schemas' || route.path.startsWith('/_desk/schemas/'))

const isContentRoute = computed(() => activeContentBase.value !== null)
const isAssetsRoute = computed(() => route.path === '/_desk/assets' || route.path.startsWith('/_desk/assets/'))

const contentChildren = computed(() => {
  const items = schemaList.value?.items ?? []
  return items.map((s: any) => ({
    label: s.title ?? s.schemaKey,
    to: `/_desk/content/${s.schemaKey}`,
    icon: 'i-lucide-file-text',
    active: activeContentBase.value === `/_desk/content/${s.schemaKey}`
  }))
})

const navItems = computed(() => ([
  {
    label: 'Dashboard',
    to: '/_desk',
    icon: 'i-lucide-home'
  },
  {
    label: 'Schemas',
    to: '/_desk/schemas',
    icon: 'i-lucide-braces',
    active: isSchemasRoute.value
  },
  {
    label: 'Content',
    icon: 'i-lucide-files',
    defaultOpen: true,
    active: isContentRoute.value,
    children: contentChildren.value
  },
  {
    label: 'Assets',
    to: '/_desk/assets',
    icon: 'i-lucide-image',
    active: isAssetsRoute.value
  },
  {
    label: 'Viewer',
    to: '/',
    icon: 'i-lucide-external-link'
  }
]))

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await navigateTo('/_desk/login')
}
</script>

<template>
  <UDashboardGroup>
    <UDashboardSidebar class="min-h-dvh" resizable collapsible :min-size="12" :max-size="25" :default-size="15">
      <template #header="{ collapsed }">
        <div class="flex items-center justify-between gap-2">
          <NuxtLink to="/_desk" class="flex items-center gap-2">
            <AppLogo class="w-auto h-6" />
            <span v-if="!collapsed" class="font-semibold">Halopress</span>
          </NuxtLink>
          <UDashboardSidebarToggle />
        </div>
      </template>

      <UNavigationMenu :items="navItems" orientation="vertical" />

      <template #footer>
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs text-muted truncate">{{ me?.user?.email || 'Guest' }}</span>
          <UButton icon="i-lucide-log-out" color="neutral" variant="ghost" @click="logout" />
        </div>
      </template>
    </UDashboardSidebar>

    <NuxtPage />
  </UDashboardGroup>
</template>
