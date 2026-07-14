<script setup lang="ts">
import { defaultSitePresentation, type PublicNavigationLeaf } from '~~/shared/site-presentation'

definePageMeta({ layout: 'desk' })

const toast = useToast()
const state = reactive(structuredClone(defaultSitePresentation().footer))
const { data, pending, error, refresh, saving, savePatch } = await useSitePresentationSettings()

watch(data, (response) => {
  if (response) Object.assign(state, structuredClone(response.value.footer))
}, { immediate: true })

function addLink() {
  const id = `footer-${globalThis.crypto?.randomUUID?.() || Date.now().toString(36)}`
  state.links.push({ id, label: 'New link', destination: { type: 'home' } } as PublicNavigationLeaf)
}

function removeLink(index: number) {
  state.links.splice(index, 1)
}

async function save() {
  try {
    await savePatch({ footer: state })
    toast.add({ title: 'Footer saved', color: 'success', icon: 'i-lucide-check' })
  } catch (saveError: any) {
    toast.add({
      title: 'Could not save footer',
      description: saveError?.data?.statusMessage || saveError?.statusMessage || 'Check the links and try again.',
      color: 'error'
    })
  }
}
</script>

<template>
  <SettingsShell
    section="footer"
    title="Footer"
    description="Configure the public footer layout, copyright, and safe links."
    :pending="pending"
    @refresh="refresh()"
  >
    <div class="space-y-6">
      <UAlert
        v-if="error"
        title="Footer settings are unavailable"
        :description="error.statusMessage || 'Refresh the page and try again.'"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
      />

      <div class="grid gap-5 sm:grid-cols-2">
        <UFormField label="Footer variant">
          <USelect v-model="state.variant" :items="['route', 'simple', 'links']" class="w-full" />
        </UFormField>
        <UFormField label="Copyright" description="Leave blank to use the current year and site name.">
          <UInput v-model="state.copyright" class="w-full" maxlength="200" />
        </UFormField>
        <USwitch v-model="state.showRoute" label="Show current route" />
      </div>

      <div class="flex items-center justify-between gap-3 border-t border-muted pt-5">
        <h2 class="font-medium text-highlighted">
          Footer links
        </h2>
        <UButton icon="i-lucide-plus" color="neutral" variant="outline" @click="addLink">
          Add link
        </UButton>
      </div>

      <div class="space-y-3">
        <fieldset v-for="(link, index) in state.links" :key="link.id" class="rounded-lg border border-default p-4">
          <legend class="sr-only">
            Footer link {{ index + 1 }}
          </legend>
          <div class="mb-3 flex justify-end">
            <UButton icon="i-lucide-trash-2" color="error" variant="ghost" aria-label="Remove footer link" @click="removeLink(index)" />
          </div>
          <SettingsNavigationItemEditor v-model="state.links[index]!" />
        </fieldset>
      </div>

      <div class="flex justify-end border-t border-muted pt-5">
        <UButton icon="i-lucide-save" :loading="saving" @click="save">
          Save footer
        </UButton>
      </div>
    </div>
  </SettingsShell>
</template>
