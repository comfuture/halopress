<script setup lang="ts">
import type { BreadcrumbItem, NavigationMenuItem } from '@nuxt/ui'
import { z } from 'zod'

definePageMeta({
  layout: 'desk'
})

type RolePermission = {
  roleKey: string
  title: string | null
  level: number
  canRead: boolean
  canWrite: boolean
  canPublish: boolean
  canArchive: boolean
  canDelete: boolean
  canAdmin: boolean
  locked?: boolean
}

type LifecycleImpact = {
  schemaKey: string
  status: 'active' | 'inactive' | 'never-published'
  activeVersion: number | null
  deactivatedAt: string | null
  deactivatedBy: string | null
  reactivatedAt: string | null
  reactivatedBy: string | null
  counts: {
    contentTotal: number
    contentByStatus: Record<string, number>
    versions: number
    drafts: number
    inboundReferences: number
    outboundReferences: number
    listings: number
    searchConfig: number
    searchProjections: number
    permissions: number
    publicationRevisions: number
    documentRevisions: number
    assetReferences: number
  }
  blockers: string[]
  canDelete: boolean
  canPurge: boolean
}

const route = useRoute()
const toast = useToast()
const { confirm } = useConfirmDialog()

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

watch(data, (value) => {
  roles.value = value?.items ?? []
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

const lifecycleUrl = computed(() => `/api/schema/${schemaKey.value}/lifecycle`)
const { data: lifecycle, pending: lifecyclePending, refresh: refreshLifecycle } = await useFetch<LifecycleImpact>(lifecycleUrl, {
  server: true,
  immediate: schemaKey.value !== 'new'
})
const lifecycleAction = ref<'deactivate' | 'reactivate' | 'delete' | 'purge' | null>(null)
const purgeOpen = ref(false)
const purgeState = reactive({ confirmation: '' })
const purgeFormSchema = computed(() => z.object({
  confirmation: z.string().refine(value => value === schemaKey.value, `Type ${schemaKey.value} to confirm.`)
}))

const lifecycleStatusLabel = computed(() => {
  if (lifecycle.value?.status === 'active') return 'Active'
  if (lifecycle.value?.status === 'inactive') return 'Inactive'
  return 'Never published'
})

const lifecycleStatusColor = computed(() => {
  if (lifecycle.value?.status === 'active') return 'success' as const
  if (lifecycle.value?.status === 'inactive') return 'warning' as const
  return 'neutral' as const
})

const impactItems = computed(() => {
  const counts = lifecycle.value?.counts
  if (!counts) return []
  return [
    { label: 'Content', value: counts.contentTotal },
    { label: 'Versions', value: counts.versions },
    { label: 'Drafts', value: counts.drafts },
    { label: 'Inbound refs', value: counts.inboundReferences },
    { label: 'Outbound refs', value: counts.outboundReferences },
    { label: 'Listings', value: counts.listings },
    { label: 'Search rows', value: counts.searchProjections },
    { label: 'Permissions', value: counts.permissions },
    { label: 'Publication history', value: counts.publicationRevisions },
    { label: 'Revision history', value: counts.documentRevisions },
    { label: 'Asset refs', value: counts.assetReferences }
  ]
})

async function refreshLifecycleSurfaces() {
  await Promise.all([refreshLifecycle(), refreshNuxtData()])
}

async function transitionLifecycle(action: 'deactivate' | 'reactivate') {
  if (lifecycleAction.value) return
  const deactivating = action === 'deactivate'
  const accepted = await confirm({
    title: deactivating ? 'Deactivate schema?' : 'Reactivate schema?',
    body: deactivating
      ? 'Content and history will be preserved, but creation and delivery will stop until reactivation.'
      : 'The schema will return to Desk content navigation and delivery immediately.',
    confirmLabel: deactivating ? 'Deactivate' : 'Reactivate',
    confirmColor: deactivating ? 'warning' : 'primary'
  })
  if (!accepted) return

  lifecycleAction.value = action
  try {
    await $fetch(`/api/schema/${schemaKey.value}/${action}`, { method: 'POST' })
    await refreshLifecycleSurfaces()
    toast.add({
      title: deactivating ? 'Schema deactivated' : 'Schema reactivated',
      description: deactivating ? 'Content creation and delivery are now blocked.' : 'Content creation and delivery are available again.'
    })
  } catch (err: any) {
    toast.add({ title: `Failed to ${action} schema`, description: err?.statusMessage || 'Error', color: 'error' })
  } finally {
    lifecycleAction.value = null
  }
}

async function deleteSchema() {
  if (!lifecycle.value?.canDelete || lifecycleAction.value) return
  const accepted = await confirm({
    title: 'Delete empty schema?',
    body: 'The empty schema, its versions, draft, permissions, search configuration, and revision metadata will be deleted permanently.',
    confirmLabel: 'Delete schema',
    confirmColor: 'error'
  })
  if (!accepted) return

  lifecycleAction.value = 'delete'
  try {
    await $fetch(`/api/schema/${schemaKey.value}`, { method: 'DELETE' })
    toast.add({ title: 'Schema deleted' })
    await navigateTo('/_desk/schemas')
    await refreshNuxtData()
  } catch (err: any) {
    toast.add({ title: 'Failed to delete schema', description: err?.data?.impact?.blockers?.join(' ') || err?.statusMessage || 'Error', color: 'error' })
    await refreshLifecycle()
  } finally {
    lifecycleAction.value = null
  }
}

function openPurge() {
  purgeState.confirmation = ''
  purgeOpen.value = true
}

async function runPurge() {
  if (lifecycleAction.value) return
  lifecycleAction.value = 'purge'
  try {
    await $fetch(`/api/schema/${schemaKey.value}/purge`, {
      method: 'POST',
      body: { confirmation: purgeState.confirmation }
    })
    purgeOpen.value = false
    toast.add({ title: 'Schema purged' })
    await navigateTo('/_desk/schemas')
    await refreshNuxtData()
  } catch (err: any) {
    toast.add({ title: 'Failed to purge schema', description: err?.statusMessage || 'Error', color: 'error' })
  } finally {
    lifecycleAction.value = null
  }
}

async function updatePermission(role: RolePermission, key: 'canRead' | 'canWrite' | 'canPublish' | 'canArchive' | 'canDelete' | 'canAdmin', value: boolean) {
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
        canPublish: role.canPublish,
        canArchive: role.canArchive,
        canDelete: role.canDelete,
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
            <span class="text-xs text-muted truncate">Choose who can view, edit, and manage this content type.</span>
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

        <fieldset v-else class="min-w-0 space-y-4">
          <legend class="text-sm font-semibold text-highlighted">
            Permissions
          </legend>
          <p class="text-xs text-muted">
            Keep editing, publishing, archiving, deleting, and schema administration separate for each role.
          </p>

          <div v-if="pending" class="space-y-2">
            <USkeleton class="h-10 w-full" />
            <USkeleton class="h-10 w-full" />
            <USkeleton class="h-10 w-full" />
          </div>

          <div v-else class="overflow-x-auto rounded-lg border border-default">
            <div class="min-w-[52rem]">
            <div class="grid grid-cols-[minmax(10rem,1fr)_repeat(6,72px)] items-center gap-2 px-4 py-2 text-xs uppercase tracking-wide text-muted border-b">
              <span>Role</span>
              <span class="text-center">Read</span>
              <span class="text-center">Write</span>
              <span class="text-center">Publish</span>
              <span class="text-center">Archive</span>
              <span class="text-center">Delete</span>
              <span class="text-center">Admin</span>
            </div>
            <div
              v-for="role in roles"
              :key="role.roleKey"
              class="grid grid-cols-[minmax(10rem,1fr)_repeat(6,72px)] items-center gap-2 px-4 py-3 border-b last:border-b-0"
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
                  :model-value="role.canPublish"
                  :loading="saving[role.roleKey]"
                  :disabled="saving[role.roleKey] || role.locked"
                  :aria-label="`Publish permission for ${role.title || role.roleKey}`"
                  @update:model-value="value => updatePermission(role, 'canPublish', value)"
                />
              </div>
              <div class="flex justify-center">
                <USwitch
                  :model-value="role.canArchive"
                  :loading="saving[role.roleKey]"
                  :disabled="saving[role.roleKey] || role.locked"
                  :aria-label="`Archive permission for ${role.title || role.roleKey}`"
                  @update:model-value="value => updatePermission(role, 'canArchive', value)"
                />
              </div>
              <div class="flex justify-center">
                <USwitch
                  :model-value="role.canDelete"
                  :loading="saving[role.roleKey]"
                  :disabled="saving[role.roleKey] || role.locked"
                  :aria-label="`Delete permission for ${role.title || role.roleKey}`"
                  @update:model-value="value => updatePermission(role, 'canDelete', value)"
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
          </div>
        </fieldset>

        <fieldset v-if="!isNew" class="rounded-lg border border-default p-4 sm:p-6">
          <legend class="px-1 text-sm font-semibold text-highlighted">Schema lifecycle</legend>
          <div class="flex flex-wrap items-start justify-between gap-3">
            <p class="text-sm text-muted">Retire, restore, or permanently remove this content model with dependency checks.</p>
            <UBadge
              :label="lifecycleStatusLabel"
              :color="lifecycleStatusColor"
              variant="soft"
            />
          </div>

          <div class="mt-5">
            <div v-if="lifecyclePending" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <USkeleton v-for="index in 4" :key="index" class="h-16" />
            </div>

            <div v-else-if="lifecycle" class="space-y-5">
              <UAlert
                v-if="lifecycle.status === 'inactive'"
                title="Creation and delivery are blocked"
                description="Content, versions, permissions, and revision history remain preserved until reactivation or purge."
                icon="i-lucide-circle-pause"
                color="warning"
                variant="subtle"
              />

              <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div v-for="item in impactItems" :key="item.label" class="rounded-lg border border-default p-3">
                  <div class="text-xs text-muted">{{ item.label }}</div>
                  <div class="mt-1 text-lg font-semibold text-highlighted">{{ item.value }}</div>
                </div>
              </div>

              <div v-if="Object.keys(lifecycle.counts.contentByStatus).length" class="flex flex-wrap items-center gap-2">
                <span class="text-xs text-muted">Content by status</span>
                <UBadge
                  v-for="(count, statusKey) in lifecycle.counts.contentByStatus"
                  :key="statusKey"
                  color="neutral"
                  variant="soft"
                  :label="`${statusKey}: ${count}`"
                />
              </div>

              <UAlert
                v-if="lifecycle.blockers.length"
                title="Empty-schema deletion is currently blocked"
                :description="lifecycle.blockers.join(' ')"
                icon="i-lucide-shield-alert"
                color="warning"
                variant="subtle"
              />
            </div>
          </div>

          <div class="mt-6 flex flex-wrap justify-end gap-2 border-t border-default pt-4">
            <UButton
              v-if="lifecycle?.status === 'active'"
              color="warning"
              variant="soft"
              icon="i-lucide-circle-pause"
              :loading="lifecycleAction === 'deactivate'"
              :disabled="!!lifecycleAction"
              @click="transitionLifecycle('deactivate')"
            >
              Deactivate
            </UButton>
            <UButton
              v-else-if="lifecycle?.status === 'inactive'"
              color="primary"
              icon="i-lucide-refresh-cw"
              :loading="lifecycleAction === 'reactivate'"
              :disabled="!!lifecycleAction"
              @click="transitionLifecycle('reactivate')"
            >
              Reactivate
            </UButton>
            <UButton
              color="error"
              variant="outline"
              icon="i-lucide-trash-2"
              :loading="lifecycleAction === 'delete'"
              :disabled="!lifecycle?.canDelete || !!lifecycleAction"
              @click="deleteSchema"
            >
              Delete empty schema
            </UButton>
            <UButton
              color="error"
              icon="i-lucide-bomb"
              :disabled="!lifecycle?.canPurge || !!lifecycleAction"
              @click="openPurge"
            >
              Purge schema and content
            </UButton>
          </div>
        </fieldset>
      </div>

      <UModal
        v-model:open="purgeOpen"
        title="Purge schema and content"
        description="This permanently removes the schema, all owned content, projections, references, permissions, drafts, and revision history. Assets are retained."
        :dismissible="lifecycleAction !== 'purge'"
      >
        <template #body>
          <UForm id="schema-purge-form" :schema="purgeFormSchema" :state="purgeState" @submit="runPurge">
            <UAlert
              title="This action cannot be undone"
              :description="`Type ${schemaKey} exactly to confirm the destructive purge.`"
              icon="i-lucide-triangle-alert"
              color="error"
              variant="subtle"
              class="mb-4"
            />
            <UFormField name="confirmation" :label="`Schema key: ${schemaKey}`" required>
              <UInput
                v-model="purgeState.confirmation"
                class="w-full"
                :placeholder="schemaKey"
                autocomplete="off"
                :disabled="lifecycleAction === 'purge'"
                autofocus
              />
            </UFormField>
          </UForm>
        </template>

        <template #footer="{ close }">
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="outline" :disabled="lifecycleAction === 'purge'" @click="close()">
              Cancel
            </UButton>
            <UButton
              type="submit"
              form="schema-purge-form"
              color="error"
              icon="i-lucide-bomb"
              :loading="lifecycleAction === 'purge'"
            >
              Purge permanently
            </UButton>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
