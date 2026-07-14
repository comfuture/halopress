<script setup lang="ts">
import {
  defaultSitePresentation,
  SITE_NEUTRAL_COLORS,
  SITE_PRIMARY_COLORS,
  SITE_THEME_PRESETS,
  siteThemePresetTokens,
  type SitePresentation
} from '~~/shared/site-presentation'

definePageMeta({ layout: 'desk' })

const toast = useToast()
const state = reactive<SitePresentation['appearance']>({ ...defaultSitePresentation().appearance })
const { data, pending, error, refresh, saving, savePatch } = await useSitePresentationSettings()

watch(data, (response) => {
  if (response) Object.assign(state, response.value.appearance)
}, { immediate: true })

const presetItems = Object.entries(SITE_THEME_PRESETS).map(([value, preset]) => ({ label: preset.label, value }))
const primaryItems = SITE_PRIMARY_COLORS.map(value => ({ label: value[0]!.toUpperCase() + value.slice(1), value }))
const neutralItems = SITE_NEUTRAL_COLORS.map(value => ({ label: value[0]!.toUpperCase() + value.slice(1), value }))

function applyPreset(value: string) {
  if (!(value in SITE_THEME_PRESETS)) return
  const presetName = value as keyof typeof SITE_THEME_PRESETS
  Object.assign(state, siteThemePresetTokens(presetName))
}

async function save() {
  try {
    await savePatch({ appearance: state })
    toast.add({ title: 'Appearance saved', color: 'success', icon: 'i-lucide-check' })
  } catch (saveError: any) {
    toast.add({
      title: 'Could not save appearance',
      description: saveError?.data?.statusMessage || saveError?.statusMessage || 'Check the values and try again.',
      color: 'error'
    })
  }
}
</script>

<template>
  <SettingsShell
    section="appearance"
    title="Appearance"
    description="Choose source-controlled presets and allowlisted semantic design tokens."
    :pending="pending"
    @refresh="refresh()"
  >
    <UAlert
      v-if="error"
      title="Appearance settings are unavailable"
      :description="error.statusMessage || 'Refresh the page and try again.'"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      class="mb-6"
    />

    <UForm :state="state" class="space-y-8" @submit="save">
      <UAlert
        title="Safe theme tokens only"
        description="Presets and semantic palettes keep public controls readable in light and dark modes. Arbitrary CSS and remote themes are not accepted."
        color="info"
        variant="subtle"
        icon="i-lucide-shield-check"
      />
      <div class="grid gap-5 sm:grid-cols-2">
        <UFormField label="Theme preset" description="Changing the preset applies its complete token bundle.">
          <USelect
            :model-value="state.preset"
            :items="presetItems"
            value-key="value"
            class="w-full"
            @update:model-value="applyPreset"
          />
        </UFormField>
        <UFormField label="Color mode">
          <USelect v-model="state.colorMode" :items="['system', 'light', 'dark']" class="w-full" />
        </UFormField>
        <UFormField label="Primary color">
          <USelect v-model="state.primaryColor" :items="primaryItems" value-key="value" class="w-full" />
        </UFormField>
        <UFormField label="Neutral color">
          <USelect v-model="state.neutralColor" :items="neutralItems" value-key="value" class="w-full" />
        </UFormField>
        <UFormField label="Typography scale">
          <USelect v-model="state.typographyScale" :items="['compact', 'default', 'relaxed']" class="w-full" />
        </UFormField>
        <UFormField label="Corner radius">
          <USelect v-model="state.radius" :items="['none', 'sm', 'md', 'lg']" class="w-full" />
        </UFormField>
      </div>

      <div class="flex justify-end border-t border-muted pt-5">
        <UButton type="submit" icon="i-lucide-save" :loading="saving">
          Save appearance
        </UButton>
      </div>
    </UForm>
  </SettingsShell>
</template>
