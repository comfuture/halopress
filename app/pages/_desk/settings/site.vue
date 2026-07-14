<script setup lang="ts">
import { defaultSitePresentation } from '~~/shared/site-presentation'

definePageMeta({ layout: 'desk' })

const toast = useToast()
const defaults = defaultSitePresentation()
const state = reactive({
  general: { ...defaults.general },
  shell: { ...defaults.shell }
})
const { data, pending, error, refresh, saving, savePatch } = await useSitePresentationSettings()

watch(data, (response) => {
  if (!response) return
  Object.assign(state.general, response.value.general)
  Object.assign(state.shell, response.value.shell)
}, { immediate: true })

async function save() {
  try {
    await savePatch({ general: state.general, shell: state.shell })
    toast.add({ title: 'Site settings saved', color: 'success', icon: 'i-lucide-check' })
  } catch (saveError: any) {
    toast.add({
      title: 'Could not save site settings',
      description: saveError?.data?.statusMessage || saveError?.statusMessage || 'Check the values and try again.',
      color: 'error'
    })
  }
}
</script>

<template>
  <SettingsShell
    section="site"
    title="Site"
    description="Configure the public identity, metadata, branding assets, and shell."
    :pending="pending"
    @refresh="refresh()"
  >
    <div class="space-y-6">
      <UAlert
        v-if="error"
        title="Site settings are unavailable"
        :description="error.statusMessage || 'Refresh the page and try again.'"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
      />
      <UAlert
        v-if="data?.malformedStoredValue"
        title="Stored site settings are invalid"
        description="Safe HaloPress defaults are active. Saving this form will replace the invalid value."
        color="warning"
        variant="subtle"
        icon="i-lucide-shield-alert"
      />
      <UAlert
        v-if="data?.missingAssetIds.length"
        title="Some branding assets are unavailable"
        :description="`Public fallbacks are active for: ${data.missingAssetIds.join(', ')}`"
        color="warning"
        variant="subtle"
        icon="i-lucide-image-off"
      />

      <UForm :state="state" class="space-y-8" @submit="save">
        <fieldset class="space-y-5">
          <legend class="text-base font-semibold text-highlighted">
            General
          </legend>
          <div class="grid gap-5 sm:grid-cols-2">
            <UFormField label="Site name" name="siteName" required>
              <UInput v-model="state.general.siteName" class="w-full" maxlength="120" />
            </UFormField>
            <UFormField label="Locale" name="locale" description="Use a BCP 47 language tag such as en or ko-KR.">
              <UInput v-model="state.general.locale" class="w-full" placeholder="en" />
            </UFormField>
            <UFormField label="Description" name="description" class="sm:col-span-2">
              <UTextarea v-model="state.general.description" class="w-full" :rows="3" maxlength="320" />
            </UFormField>
          </div>
        </fieldset>

        <fieldset class="space-y-5">
          <legend class="text-base font-semibold text-highlighted">
            Branding assets
          </legend>
          <div class="grid gap-6 md:grid-cols-3">
            <CmsAssetPicker v-model="state.general.logoAssetId" label="Header logo" />
            <CmsAssetPicker v-model="state.general.faviconAssetId" label="Favicon" />
            <CmsAssetPicker v-model="state.general.socialImageAssetId" label="Default social image" />
          </div>
          <p class="text-sm text-muted">
            Missing or cleared assets fall back to the built-in HaloPress identity. In-use branding assets cannot be deleted or replaced until they are cleared here.
          </p>
        </fieldset>

        <fieldset class="space-y-5">
          <legend class="text-base font-semibold text-highlighted">
            Public shell
          </legend>
          <div class="grid gap-5 sm:grid-cols-2">
            <UFormField label="Content width">
              <USelect v-model="state.shell.width" :items="['default', 'wide', 'centered']" class="w-full" />
            </UFormField>
            <UFormField label="Header variant">
              <USelect v-model="state.shell.headerVariant" :items="['standard', 'centered', 'minimal']" class="w-full" />
            </UFormField>
            <USwitch v-model="state.shell.showDeskLink" label="Show Desk link" />
            <USwitch v-model="state.shell.showColorMode" label="Show color mode control" />
          </div>
        </fieldset>

        <div class="flex justify-end border-t border-muted pt-5">
          <UButton type="submit" icon="i-lucide-save" :loading="saving">
            Save site settings
          </UButton>
        </div>
      </UForm>
    </div>
  </SettingsShell>
</template>
