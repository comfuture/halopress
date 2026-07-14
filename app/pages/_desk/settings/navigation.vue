<script setup lang="ts">
import type { PublicNavigationItem } from '~~/shared/site-presentation'

definePageMeta({ layout: 'desk' })

const toast = useToast()
const items = ref<PublicNavigationItem[]>([])
const { data, pending, error, refresh, saving, savePatch } = await useSitePresentationSettings()

watch(data, (response) => {
  if (response) items.value = structuredClone(response.value.navigation.items)
}, { immediate: true })

function newId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || Date.now().toString(36)}`
}

function addItem() {
  items.value.push({ id: newId('nav'), label: 'New link', destination: { type: 'home' }, children: [] })
}

function addChild(item: PublicNavigationItem) {
  item.children.push({ id: newId('nav-child'), label: 'Child link', destination: { type: 'home' } })
}

function move(index: number, direction: -1 | 1) {
  const next = index + direction
  if (next < 0 || next >= items.value.length) return
  const [item] = items.value.splice(index, 1)
  items.value.splice(next, 0, item!)
}

function removeItem(index: number) {
  items.value.splice(index, 1)
}

function removeChild(item: PublicNavigationItem, index: number) {
  item.children.splice(index, 1)
}

async function save() {
  try {
    await savePatch({ navigation: { items: items.value } })
    toast.add({ title: 'Navigation saved', color: 'success', icon: 'i-lucide-check' })
  } catch (saveError: any) {
    toast.add({
      title: 'Could not save navigation',
      description: saveError?.data?.statusMessage || saveError?.statusMessage || 'Check the destinations and try again.',
      color: 'error'
    })
  }
}
</script>

<template>
  <SettingsShell
    section="navigation"
    title="Navigation"
    description="Manage ordered, nested public links with safe typed destinations."
    :pending="pending"
    @refresh="refresh()"
  >
    <div class="space-y-6">
      <UAlert
        v-if="error"
        title="Navigation settings are unavailable"
        :description="error.statusMessage || 'Refresh the page and try again.'"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
      />

      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-muted">
          Internal destinations resolve through HaloPress route types. External links accept only HTTP or HTTPS URLs.
        </p>
        <UButton icon="i-lucide-plus" color="neutral" variant="outline" @click="addItem">
          Add link
        </UButton>
      </div>

      <UAlert
        v-if="items.length === 0"
        title="No public navigation links"
        description="The default HaloPress header remains unchanged until links are added."
        icon="i-lucide-info"
        variant="subtle"
      />

      <div class="space-y-4">
        <fieldset v-for="(item, index) in items" :key="item.id" class="space-y-4 rounded-lg border border-default p-4">
          <legend class="px-1 text-sm font-medium text-highlighted">
            Link {{ index + 1 }}
          </legend>
          <div class="flex justify-end gap-1">
            <UButton icon="i-lucide-arrow-up" color="neutral" variant="ghost" :disabled="index === 0" aria-label="Move link up" @click="move(index, -1)" />
            <UButton icon="i-lucide-arrow-down" color="neutral" variant="ghost" :disabled="index === items.length - 1" aria-label="Move link down" @click="move(index, 1)" />
            <UButton icon="i-lucide-trash-2" color="error" variant="ghost" aria-label="Remove link" @click="removeItem(index)" />
          </div>

          <SettingsNavigationItemEditor v-model="items[index]!" />

          <div v-if="item.children.length" class="space-y-3 border-s border-muted ps-4">
            <fieldset v-for="(child, childIndex) in item.children" :key="child.id" class="rounded-md bg-elevated/40 p-4">
              <legend class="sr-only">
                Child link {{ childIndex + 1 }}
              </legend>
              <div class="mb-3 flex justify-end">
                <UButton
                  icon="i-lucide-x"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  aria-label="Remove child link"
                  @click="removeChild(item, childIndex)"
                />
              </div>
              <SettingsNavigationItemEditor v-model="item.children[childIndex]!" />
            </fieldset>
          </div>

          <div>
            <UButton
              color="neutral"
              variant="link"
              icon="i-lucide-corner-down-right"
              :disabled="item.children.length >= 8"
              @click="addChild(item)"
            >
              Add child link
            </UButton>
          </div>
        </fieldset>
      </div>

      <div class="flex justify-end border-t border-muted pt-5">
        <UButton icon="i-lucide-save" :loading="saving" @click="save">
          Save navigation
        </UButton>
      </div>
    </div>
  </SettingsShell>
</template>
