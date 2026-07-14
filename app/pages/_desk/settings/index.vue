<script setup lang="ts">
import { SETTINGS_SECTIONS } from '~~/shared/settings-sections'

definePageMeta({
  layout: 'desk'
})

type AuthenticationSummary = {
  enabled: boolean
  configured: boolean
  envManaged: boolean
}

const { data: authentication, pending, error, refresh } = await useFetch<AuthenticationSummary>('/api/settings/authentication')

const sections = computed(() => SETTINGS_SECTIONS.filter(section => section.id !== 'overview'))

function statusFor(sectionId: string) {
  if (sectionId !== 'authentication') return { label: 'Ready to extend', color: 'neutral' as const }
  if (authentication.value?.enabled) return { label: 'Enabled', color: 'success' as const }
  if (authentication.value?.configured) return { label: 'Ready to enable', color: 'info' as const }
  return { label: 'Not configured', color: 'neutral' as const }
}
</script>

<template>
  <SettingsShell
    section="overview"
    title="Settings"
    description="Manage deployment-owned configuration through typed, purpose-built sections."
    :pending="pending"
    @refresh="refresh()"
  >
    <div class="space-y-6">
      <UAlert
        v-if="error"
        title="Some settings status is unavailable"
        :description="error.statusMessage || 'Refresh the page and try again.'"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
      />

      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <UPageCard
          v-for="section in sections"
          :key="section.id"
          :title="section.label"
          :description="section.description"
          :icon="section.icon"
          :to="section.to"
          variant="outline"
        >
          <template #footer>
            <div class="flex items-center justify-between gap-3">
              <UBadge :color="statusFor(section.id).color" variant="soft">
                {{ statusFor(section.id).label }}
              </UBadge>
              <span class="text-xs text-muted">
                {{ section.id === 'authentication' && authentication?.envManaged ? 'Environment managed' : 'Desk section' }}
              </span>
            </div>
          </template>
        </UPageCard>
      </div>

      <UAlert
        title="Settings are intentionally typed"
        description="HaloPress exposes validated controls for each feature area instead of a raw key/value editor. Secrets remain redacted and deployment-managed values stay read-only."
        color="info"
        variant="subtle"
        icon="i-lucide-shield-check"
      />
    </div>
  </SettingsShell>
</template>
