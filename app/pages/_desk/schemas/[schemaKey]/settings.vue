<script setup lang="ts">
import type { BreadcrumbItem, NavigationMenuItem } from '@nuxt/ui'

definePageMeta({
  layout: 'desk'
})

type RolePermission = {
  roleKey: string
  title: string | null
  level: number
  canRead: boolean
  canWrite: boolean
  canAdmin: boolean
  locked?: boolean
}

const route = useRoute()
const toast = useToast()

const schemaKey = computed(() => String(route.params.schemaKey))
const isNew = computed(() => schemaKey.value === 'new')

const toolbarItems = computed<NavigationMenuItem[]>(() => ([
  {
    label: 'Schema',
    icon: 'i-lucide-braces',
    to: `/_desk/schemas/${schemaKey.value}`,
    active: !route.path.endsWith('/settings')
  },
  {
    label: 'Settings',
    icon: 'i-lucide-settings',
    to: `/_desk/schemas/${schemaKey.value}/settings`,
    active: route.path.endsWith('/settings'),
    disabled: isNew.value
  }
]))

const breadcrumbItems = computed<BreadcrumbItem[]>(() => ([
  { label: 'Schemas', to: '/_desk/schemas' },
  { label: schemaKey.value }
]))

const fetchUrl = computed(() => `/api/schema/${schemaKey.value}/roles`)
const { data, pending, refresh } = await useFetch<{ items: RolePermission[] }>(fetchUrl, {
  server: true,
  immediate: schemaKey.value !== 'new'
})

const roles = ref<RolePermission[]>([])

function normalizeRoles(items: RolePermission[] = []) {
  return items.map(item => ({
    ...item,
    canRead: item.roleKey === 'admin' ? true : item.canRead,
    canWrite: item.roleKey === 'admin' ? true : item.canWrite,
    canAdmin: item.roleKey === 'admin' ? true : item.canAdmin,
    locked: item.roleKey === 'admin' ? true : item.locked
  }))
}

watch(data, (value) => {
  roles.value = normalizeRoles(value?.items ?? [])
}, { immediate: true })

watch(schemaKey, async (value, prev) => {
  if (value === prev) return
  if (!value || value === 'new') {
    roles.value = []
    return
  }
  await refresh()
})

const saving = reactive<Record<string, boolean>>({})

async function updatePermission(role: RolePermission, key: 'canRead' | 'canWrite' | 'canAdmin', value: boolean) {
  if (role.locked) return
  if (saving[role.roleKey]) return
  const previous = role[key]
  role[key] = value
  saving[role.roleKey] = true
  try {
    await $fetch(`/api/schema/${schemaKey.value}/roles`, {
      method: 'PATCH',
      body: {
        roleKey: role.roleKey,
        canRead: role.canRead,
        canWrite: role.canWrite,
        canAdmin: role.canAdmin
      }
    })
  } catch (err: any) {
    role[key] = previous
    toast.add({ title: 'Failed to update permission', description: err?.statusMessage || 'Error', color: 'error' })
  } finally {
    saving[role.roleKey] = false
  }
}
</script>

<template>
  <UDashboardPanel id="desk-schema-settings">
    <template #header>
      <DeskNavbar :title="`Schema: ${schemaKey}`">
        <template #title>
          <div class="flex flex-col min-w-0">
            <UBreadcrumb :items="breadcrumbItems" />
            <span class="text-xs text-muted truncate">Manage schema settings and permissions.</span>
          </div>
        </template>
      </DeskNavbar>

      <UDashboardToolbar :ui="{ left: 'flex w-full' }">
        <template #left>
          <div class="w-full px-2">
            <UNavigationMenu
              :items="toolbarItems"
              highlight
              highlight-color="primary"
              variant="link"
              class="w-full data-[orientation=horizontal]:border-b border-default"
            />
          </div>
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="space-y-6">
        <UAlert
          v-if="isNew"
          title="Create the schema first"
          description="Save the schema draft before managing permissions."
          icon="i-lucide-alert-circle"
          variant="subtle"
        />

        <UCard v-else>
          <template #header>
            <div>
              <p class="text-sm font-semibold">Permissions</p>
              <p class="text-xs text-muted">Control read/write/admin access per role.</p>
            </div>
          </template>

          <div v-if="pending" class="space-y-2">
            <USkeleton class="h-10 w-full" />
            <USkeleton class="h-10 w-full" />
            <USkeleton class="h-10 w-full" />
          </div>

          <div v-else class="rounded-lg border border-default">
            <div class="grid grid-cols-[minmax(0,1fr)_repeat(3,80px)] items-center gap-2 px-4 py-2 text-xs uppercase tracking-wide text-muted border-b">
              <span>Role</span>
              <span class="text-center">Read</span>
              <span class="text-center">Write</span>
              <span class="text-center">Admin</span>
            </div>
            <div
              v-for="role in roles"
              :key="role.roleKey"
              class="grid grid-cols-[minmax(0,1fr)_repeat(3,80px)] items-center gap-2 px-4 py-3 border-b last:border-b-0"
            >
              <div class="min-w-0">
                <div class="text-sm font-medium truncate">{{ role.title || role.roleKey }}</div>
                <div class="text-xs text-muted font-mono truncate">{{ role.roleKey }}</div>
              </div>
              <div class="flex justify-center">
                <USwitch
                  :model-value="role.canRead"
                  :loading="saving[role.roleKey]"
                  :disabled="saving[role.roleKey] || role.locked"
                  :aria-label="`Read permission for ${role.title || role.roleKey}`"
                  @update:model-value="value => updatePermission(role, 'canRead', value)"
                />
              </div>
              <div class="flex justify-center">
                <USwitch
                  :model-value="role.canWrite"
                  :loading="saving[role.roleKey]"
                  :disabled="saving[role.roleKey] || role.locked"
                  :aria-label="`Write permission for ${role.title || role.roleKey}`"
                  @update:model-value="value => updatePermission(role, 'canWrite', value)"
                />
              </div>
              <div class="flex justify-center">
                <USwitch
                  :model-value="role.canAdmin"
                  :loading="saving[role.roleKey]"
                  :disabled="saving[role.roleKey] || role.locked"
                  :aria-label="`Admin permission for ${role.title || role.roleKey}`"
                  @update:model-value="value => updatePermission(role, 'canAdmin', value)"
                />
              </div>
            </div>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
