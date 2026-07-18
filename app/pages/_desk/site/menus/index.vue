<script setup lang="ts">
import type { SiteMenuAdminResource } from '~~/shared/site-menu'

definePageMeta({ layout: 'desk' })

const toast = useToast()
const { confirm } = useConfirmDialog()
const {
  data,
  pending,
  error,
  refresh,
  creating,
  deleting,
  createMenu,
  deleteMenu
} = useSiteMenus()

const createName = ref('')
const deletingId = ref('')

async function createSet() {
  const name = createName.value.trim()
  if (!name) return
  try {
    const resource = await createMenu(name)
    createName.value = ''
    toast.add({
      title: 'Menu set created',
      description: resource.name,
      color: 'success',
      icon: 'i-lucide-check'
    })
    await navigateTo({
      path: `/_desk/site/menus/${encodeURIComponent(resource.id)}`,
      query: { created: resource.id }
    })
  } catch (createError: any) {
    toast.add({
      title: 'Could not create menu set',
      description: createError?.data?.statusMessage || createError?.statusMessage || 'Choose a different name and try again.',
      color: 'error'
    })
  }
}

async function removeMenu(resource: SiteMenuAdminResource) {
  if (!resource.canDelete || deleting.value) return
  const accepted = await confirm({
    title: `Delete ${resource.name}?`,
    body: 'This permanently deletes the unreferenced menu set.',
    confirmLabel: 'Delete menu'
  })
  if (!accepted) return

  deletingId.value = resource.id
  try {
    const currentItems = data.value?.items ?? []
    const removedIndex = currentItems.findIndex(item => item.id === resource.id)
    const focusId = currentItems[removedIndex + 1]?.id ?? currentItems[removedIndex - 1]?.id
    await deleteMenu(resource.id)
    await nextTick()
    const target = focusId
      ? document.querySelector<HTMLElement>(`[data-menu-set-edit="${CSS.escape(focusId)}"]`)
      : document.querySelector<HTMLElement>('[data-menu-create-name]')
        ?? document.querySelector<HTMLElement>('[data-menu-list-heading]')
    target?.focus()
    toast.add({ title: 'Menu set deleted', color: 'success', icon: 'i-lucide-check' })
  } catch (deleteError: any) {
    toast.add({
      title: 'Could not delete menu set',
      description: deleteError?.data?.statusMessage || deleteError?.statusMessage || 'Review its usage and try again.',
      color: 'error'
    })
  } finally {
    deletingId.value = ''
  }
}
</script>

<template>
  <SiteAdminSection
    section="menus"
    title="Menus"
    description="Manage named navigation sets, then open one to arrange and edit its links."
  >
    <div class="space-y-6">
      <div v-if="pending" class="space-y-3" aria-busy="true" aria-label="Loading menu sets">
        <USkeleton class="h-32 w-full" />
        <USkeleton class="h-56 w-full" />
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
        <section class="rounded-lg border border-default p-4 sm:p-5" aria-labelledby="menu-create-heading">
          <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,28rem)] lg:items-end">
            <div class="space-y-1">
              <h2 id="menu-create-heading" class="text-base font-semibold text-highlighted">
                Create a menu set
              </h2>
              <p class="text-sm text-muted">
                Menu sets have stable IDs and can be reused by future HaloPress Site layouts.
              </p>
            </div>
            <form @submit.prevent="createSet">
              <UFormField label="Menu name" description="Names are Unicode-aware and unique regardless of case.">
                <div class="flex gap-2">
                  <UInput
                    v-model="createName"
                    class="min-w-0 flex-1"
                    placeholder="Footer links"
                    maxlength="80"
                    data-menu-create-name
                  />
                  <UButton
                    type="submit"
                    icon="i-lucide-plus"
                    :loading="creating"
                    :disabled="!createName.trim()"
                  >
                    Create
                  </UButton>
                </div>
              </UFormField>
            </form>
          </div>
        </section>

        <section class="space-y-3" aria-labelledby="menu-list-heading">
          <div>
            <h2 id="menu-list-heading" class="text-lg font-semibold text-highlighted" data-menu-list-heading tabindex="-1">
              Menu sets
            </h2>
            <p class="text-sm text-muted">
              Open a set to preview, reorder, and edit its individual links.
            </p>
          </div>

          <UAlert
            v-if="!data?.items.length"
            title="No menu sets"
            description="Create a menu set to begin."
            variant="subtle"
            icon="i-lucide-info"
          />

          <ul v-else class="grid gap-3" aria-label="Menu sets">
            <li
              v-for="menu in data.items"
              :key="menu.id"
              class="rounded-lg border border-default bg-default p-4"
              :data-menu-set-row="menu.id"
            >
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div class="min-w-0 space-y-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <h3 class="truncate font-medium text-highlighted">{{ menu.name }}</h3>
                    <UBadge v-if="menu.id === data.defaultMenuId" color="primary" variant="soft">
                      Public default
                    </UBadge>
                    <UBadge :color="menu.canDelete ? 'neutral' : 'info'" variant="soft">
                      {{ menu.canDelete ? 'Unreferenced' : `Used by ${menu.usage.length}` }}
                    </UBadge>
                  </div>
                  <p class="text-sm text-muted">
                    {{ menu.document.items.length }} top-level {{ menu.document.items.length === 1 ? 'link' : 'links' }}
                    · {{ menu.document.items.reduce((count, item) => count + item.children.length, 0) }} child links
                  </p>
                  <p class="break-all text-xs text-dimmed">Stable ID: {{ menu.id }}</p>
                </div>

                <div class="flex items-center gap-2">
                  <UButton
                    :to="`/_desk/site/menus/${encodeURIComponent(menu.id)}`"
                    icon="i-lucide-pencil"
                    :data-menu-set-edit="menu.id"
                  >
                    Edit
                  </UButton>
                  <UButton
                    type="button"
                    icon="i-lucide-trash-2"
                    color="error"
                    variant="outline"
                    :loading="deleting && deletingId === menu.id"
                    :disabled="!menu.canDelete || (deleting && deletingId !== menu.id)"
                    :aria-label="`Delete ${menu.name}`"
                    @click="removeMenu(menu)"
                  >
                    Delete
                  </UButton>
                </div>
              </div>

              <p v-if="menu.usage.length" class="mt-3 text-xs text-muted">
                Used by: {{ menu.usage.map(item => item.label).join(', ') }}
              </p>
            </li>
          </ul>
        </section>
      </template>
    </div>
  </SiteAdminSection>
</template>
