<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'
import { buildSiteAdminNavigation } from '~~/shared/site-admin-sections'

const route = useRoute()

const { data, signOut } = useAuth()
const { enabled: siteModeEnabled } = useSiteMode()
const { data: schemaList } = await useFetch<{ items: any[] }>('/api/schema/list')
const openNavItems = ref<string[]>(['content'])

function setNavigationOpen(value: string, open: boolean) {
  const next = new Set(openNavItems.value)
  if (open) next.add(value)
  else next.delete(value)
  openNavItems.value = [...next]
}

watch(siteModeEnabled, enabled => setNavigationOpen('site', enabled), { immediate: true })
watch(() => route.path, path => {
  if (path === '/_desk/site' || path.startsWith('/_desk/site/')) setNavigationOpen('site', true)
})

const activeContentBase = computed(() => {
  const parts = route.path.split('/').filter(Boolean)
  if (parts[0] !== '_desk' || parts[1] !== 'content') return null
  const schemaKey = parts[2]
  if (!schemaKey) return '/_desk/content'
  return `/_desk/content/${schemaKey}`
})

const isSchemasRoute = computed(() => route.path === '/_desk/schemas' || route.path.startsWith('/_desk/schemas/'))
const isUsersRoute = computed(() => route.path === '/_desk/users' || route.path.startsWith('/_desk/users/'))
const isSettingsRoute = computed(() => route.path === '/_desk/settings' || route.path.startsWith('/_desk/settings/'))

const isContentRoute = computed(() => activeContentBase.value !== null)
const isAssetsRoute = computed(() => route.path === '/_desk/assets' || route.path.startsWith('/_desk/assets/'))
const isPagesRoute = computed(() => route.path === '/_desk/pages' || route.path.startsWith('/_desk/pages/'))

const contentChildren = computed(() => {
  const items = schemaList.value?.items ?? []
  return items.map((s: any) => ({
    label: s.title ?? s.schemaKey,
    to: `/_desk/content/${s.schemaKey}`,
    icon: 'i-lucide-file-text',
    active: activeContentBase.value === `/_desk/content/${s.schemaKey}`
  }))
})

const siteNavigation = computed(() => buildSiteAdminNavigation(route.path, siteModeEnabled.value))

const navItems = computed<NavigationMenuItem[]>(() => ([
  {
    label: 'Dashboard',
    to: '/_desk',
    icon: 'i-lucide-home'
  },
  {
    label: 'Users',
    to: '/_desk/users',
    icon: 'i-lucide-users',
    active: isUsersRoute.value
  },
  {
    label: 'Schemas',
    to: '/_desk/schemas',
    icon: 'i-lucide-braces',
    active: isSchemasRoute.value
  },
  {
    label: 'Content',
    value: 'content',
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
    label: 'Pages',
    to: '/_desk/pages',
    icon: 'i-lucide-panels-top-left',
    active: isPagesRoute.value
  },
  ...(siteNavigation.value ? [siteNavigation.value] : []),
  {
    label: 'Settings',
    to: '/_desk/settings',
    icon: 'i-lucide-settings',
    active: isSettingsRoute.value
  },
  {
    label: 'Viewer',
    to: '/',
    icon: 'i-lucide-external-link'
  }
]))

async function logout() {
  await signOut({ callbackUrl: '/_desk/login' })
}
</script>

<template>
  <UDashboardGroup>
    <UDashboardSidebar class="min-h-dvh" resizable collapsible :min-size="12" :max-size="25" :default-size="15">
      <template #header="{ collapsed }">
        <div class="flex items-center justify-between gap-2">
          <NuxtLink to="/_desk" aria-label="HaloPress Desk">
            <AppLogo :mark-only="collapsed" class="h-7 w-auto" />
          </NuxtLink>
          <UDashboardSidebarToggle />
        </div>
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu
          v-model="openNavItems"
          :items="navItems"
          orientation="vertical"
          :collapsed="collapsed"
          :tooltip="collapsed"
          :popover="collapsed"
        />
      </template>

      <template #footer>
        <div class="flex items-center justify-between gap-2">
          <ClientOnly>
            <span class="text-xs text-muted truncate">{{ data?.user?.email || 'Guest' }}</span>
            <template #fallback>
              <span class="text-xs text-muted truncate">Guest</span>
            </template>
          </ClientOnly>
          <UButton icon="i-lucide-log-out" color="neutral" variant="ghost" @click="logout" />
        </div>
      </template>
    </UDashboardSidebar>

    <NuxtPage />
  </UDashboardGroup>
</template>
