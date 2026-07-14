<script setup lang="ts">
import { findSettingsSection, type SettingsSectionId } from '~~/shared/settings-sections'

definePageMeta({
  layout: 'desk'
})

const route = useRoute()
const section = computed(() => findSettingsSection(String(route.params.section)))

if (!section.value || section.value.availability !== 'extension') {
  throw createError({ statusCode: 404, statusMessage: 'Settings section not found' })
}

const sectionId = computed(() => section.value!.id as SettingsSectionId)
</script>

<template>
  <SettingsShell
    :section="sectionId"
    :title="section!.label"
    :description="section!.description"
  >
    <UPageCard
      title="Extension point ready"
      :description="`${section!.label} settings have a stable route and typed section identity. Their controls will be added by the feature that owns this area.`"
      :icon="section!.icon"
      variant="subtle"
    >
      <template #footer>
        <UBadge color="neutral" variant="soft">
          No settings available yet
        </UBadge>
      </template>
    </UPageCard>
  </SettingsShell>
</template>
