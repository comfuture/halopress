<script setup lang="ts">
import { ulid } from 'ulid'

import type { SiteMenuAdminResource, SiteMenuValidationIssue } from '~~/shared/site-menu'

definePageMeta({ layout: 'desk' })

const toast = useToast()
const { confirm } = useConfirmDialog()
const {
  data,
  pending,
  status,
  error,
  refresh,
  saving,
  creating,
  deleting,
  createMenu,
  saveMenu,
  deleteMenu
} = await useSiteMenus()

const selectedId = ref('')
const working = ref<SiteMenuAdminResource | null>(null)
const baseline = ref('')
const createName = ref('')
const announcement = ref('')
const validationIssues = ref<SiteMenuValidationIssue[]>([])

const menuOptions = computed(() => (data.value?.items ?? []).map(menu => ({
  label: `${menu.name} (${menu.document.items.length})`,
  value: menu.id
})))
const selectedResource = computed(() => data.value?.items.find(menu => menu.id === selectedId.value) ?? null)
const currentSnapshot = computed(() => working.value
  ? JSON.stringify({ name: working.value.name, document: working.value.document })
  : '')
const isDirty = computed(() => Boolean(working.value && isSiteMenuWorkingCopyDirty(
  working.value.malformedStoredValue,
  currentSnapshot.value,
  baseline.value
)))

useUnsavedNavigationGuard(isDirty, 'You have unsaved menu changes. Leave and discard them?')

function loadResource(resource: SiteMenuAdminResource | null) {
  working.value = resource ? structuredClone(resource) : null
  validationIssues.value = []
  baseline.value = working.value
    ? JSON.stringify({ name: working.value.name, document: working.value.document })
    : ''
}

function initializeSelection() {
  if (selectedResource.value) return loadResource(selectedResource.value)
  const defaultId = data.value?.defaultMenuId
  const next = data.value?.items.find(menu => menu.id === defaultId) || data.value?.items[0] || null
  selectedId.value = next?.id || ''
  loadResource(next)
}

watch([data, status], ([response, requestStatus]) => {
  if (!shouldInitializeSiteMenuSelection(response, requestStatus, Boolean(working.value))) return
  initializeSelection()
}, { immediate: true })

watch(working, () => {
  if (validationIssues.value.length) validationIssues.value = []
}, { deep: true })

async function selectMenu(menuId: string) {
  if (menuId === selectedId.value) return
  if (isDirty.value) {
    const discard = await confirm({
      title: 'Discard menu changes?',
      body: 'The selected menu has changes that have not been saved.',
      confirmLabel: 'Discard changes'
    })
    if (!discard) return
  }
  selectedId.value = menuId
  loadResource(data.value?.items.find(menu => menu.id === menuId) ?? null)
}

async function createSet() {
  const name = createName.value.trim()
  if (!name) return
  if (isDirty.value) {
    const discard = await confirm({
      title: 'Discard menu changes?',
      body: 'Creating a menu switches away from the current unsaved menu.',
      confirmLabel: 'Discard and create'
    })
    if (!discard) return
  }
  try {
    const resource = await createMenu(name)
    createName.value = ''
    selectedId.value = resource.id
    loadResource(resource)
    toast.add({ title: 'Menu set created', description: resource.name, color: 'success', icon: 'i-lucide-check' })
  } catch (createError: any) {
    toast.add({
      title: 'Could not create menu set',
      description: createError?.data?.statusMessage || createError?.statusMessage || 'Choose a different name and try again.',
      color: 'error'
    })
  }
}

function addItem() {
  if (!working.value || working.value.document.items.length >= 12) return
  working.value.document.items.push({
    id: `menu-${ulid()}`,
    label: 'New link',
    destination: { type: 'home' },
    children: []
  })
  announcement.value = `Added link ${working.value.document.items.length}.`
}

async function save() {
  if (!working.value) return
  try {
    const resource = await saveMenu(working.value.id, {
      name: working.value.name,
      document: working.value.document
    })
    loadResource(resource)
    toast.add({ title: 'Menu saved', description: 'Public navigation updates immediately.', color: 'success', icon: 'i-lucide-check' })
  } catch (saveError: any) {
    validationIssues.value = siteMenuValidationIssuesFromFetchError(saveError)
    await nextTick()
    focusFirstSiteMenuValidationIssue(validationIssues.value)
    toast.add({
      title: 'Could not save menu',
      description: saveError?.data?.statusMessage || saveError?.statusMessage || 'Check the menu fields and try again.',
      color: 'error'
    })
  }
}

async function removeSelected() {
  if (!working.value?.canDelete) return
  const target = working.value
  const accepted = await confirm({
    title: `Delete ${target.name}?`,
    body: 'This permanently deletes the unreferenced menu set.',
    confirmLabel: 'Delete menu'
  })
  if (!accepted) return

  try {
    await deleteMenu(target.id)
    const next = data.value?.items[0] || null
    selectedId.value = next?.id || ''
    loadResource(next)
    toast.add({ title: 'Menu set deleted', color: 'success', icon: 'i-lucide-check' })
  } catch (deleteError: any) {
    const usage = siteMenuUsageFromFetchError(deleteError)
    if (usage && working.value?.id === target.id) {
      working.value.usage = usage
      working.value.canDelete = false
    }
    toast.add({
      title: 'Could not delete menu set',
      description: deleteError?.data?.statusMessage || deleteError?.statusMessage || 'Review its usage and try again.',
      color: 'error'
    })
  }
}
</script>

<template>
  <SiteAdminSection
    section="menus"
    title="Menus"
    description="Manage named, reusable navigation sets with typed destinations."
  >
    <div class="space-y-6">
      <div v-if="pending" class="space-y-3" aria-busy="true" aria-label="Loading menu sets">
        <USkeleton class="h-20 w-full" />
        <USkeleton class="h-72 w-full" />
      </div>

      <UAlert
        v-else-if="error"
        title="Menu sets are unavailable"
        :description="error.statusMessage || 'Refresh the page and try again.'"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
      >
        <template #actions>
          <UButton color="neutral" variant="outline" icon="i-lucide-rotate-cw" @click="refresh()">
            Refresh
          </UButton>
        </template>
      </UAlert>

      <template v-else>
        <section class="rounded-lg border border-default p-4" aria-labelledby="menu-set-selector-heading">
          <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,1fr)]">
            <div class="space-y-2">
              <h2 id="menu-set-selector-heading" class="text-sm font-medium text-highlighted">
                Menu set
              </h2>
              <USelect
                :model-value="selectedId"
                :items="menuOptions"
                value-key="value"
                class="w-full"
                aria-label="Select a menu set"
                @update:model-value="selectMenu(String($event))"
              />
              <p class="text-xs text-muted">
                Global navigation powers the current public header and mobile drawer. Future SiteLayouts can reference other stable menu IDs.
              </p>
            </div>

            <form class="space-y-2" @submit.prevent="createSet">
              <UFormField label="Create a menu set" description="Names must be unique regardless of letter case.">
                <div class="flex gap-2">
                  <UInput v-model="createName" class="min-w-0 flex-1" placeholder="Footer links" maxlength="80" />
                  <UButton type="submit" icon="i-lucide-plus" :loading="creating" :disabled="!createName.trim()">
                    Create
                  </UButton>
                </div>
              </UFormField>
            </form>
          </div>
        </section>

        <section v-if="working" class="space-y-6" :aria-labelledby="`menu-editor-${working.id}`">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div class="min-w-0 flex-1 space-y-2">
              <h2 :id="`menu-editor-${working.id}`" class="text-lg font-semibold text-highlighted">
                Edit menu set
              </h2>
              <UFormField
                label="Name"
                required
                class="max-w-xl"
                :error="validationMessageForPath(validationIssues, 'name')"
              >
                <UInput
                  v-model="working.name"
                  class="w-full"
                  maxlength="80"
                  data-validation-path="name"
                />
              </UFormField>
              <p class="break-all text-xs text-muted">
                Stable menu ID: {{ working.id }}
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <UBadge :color="working.canDelete ? 'neutral' : 'info'" variant="soft">
                {{ working.canDelete ? 'Unreferenced' : `Used by ${working.usage.length}` }}
              </UBadge>
              <UButton
                type="button"
                icon="i-lucide-trash-2"
                color="error"
                variant="outline"
                :loading="deleting"
                :disabled="!working.canDelete"
                @click="removeSelected"
              >
                Delete
              </UButton>
            </div>
          </div>

          <UAlert
            v-if="working.malformedStoredValue"
            title="This menu needs repair"
            description="Its stored document was malformed, so the safe empty fallback is shown. Saving replaces it atomically."
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
          />

          <UAlert
            v-if="working.usage.length"
            title="Deletion is guarded"
            :description="`Used by: ${working.usage.map(item => item.label).join(', ')}`"
            color="info"
            variant="subtle"
            icon="i-lucide-link"
          />

          <div class="flex flex-wrap items-center justify-between gap-3">
            <p class="text-sm text-muted">
              Drag the handles with a pointer or touch, or use the move buttons with a keyboard. One child level is supported.
            </p>
            <UButton
              type="button"
              icon="i-lucide-plus"
              color="neutral"
              variant="outline"
              :disabled="working.document.items.length >= 12"
              @click="addItem"
            >
              Add link
            </UButton>
          </div>

          <UAlert
            v-if="working.document.items.length === 0"
            title="This menu is empty"
            description="Add a link to start building its ordered navigation."
            icon="i-lucide-info"
            variant="subtle"
          />

          <SiteMenuItemList
            v-model="working.document.items"
            :validation-issues="validationIssues"
            @announce="announcement = $event"
          />

          <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">
            {{ announcement }}
          </p>

          <div class="sticky bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-default bg-default/95 p-4 shadow-lg backdrop-blur">
            <p class="text-sm" :class="isDirty ? 'text-warning' : 'text-muted'">
              {{ isDirty ? 'Unsaved menu changes' : 'All menu changes are saved' }}
            </p>
            <UButton
              type="button"
              icon="i-lucide-save"
              :loading="saving"
              :disabled="!isDirty || !working.name.trim()"
              @click="save"
            >
              Save menu
            </UButton>
          </div>
        </section>
      </template>
    </div>
  </SiteAdminSection>
</template>
