<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'
import { SETTINGS_SECTIONS, type SettingsSectionId } from '~~/shared/settings-sections'

const props = defineProps<{
  section: SettingsSectionId
  title: string
  description: string
  pending?: boolean
}>()

const emit = defineEmits<{
  refresh: []
}>()

const route = useRoute()

const navigationItems = computed<NavigationMenuItem[]>(() => SETTINGS_SECTIONS.map(section => ({
  label: section.label,
  description: section.description,
  icon: section.icon,
  to: section.to,
  active: section.id === props.section || (section.id !== 'overview' && route.path.startsWith(`${section.to}/`))
})))
</script>

<template>
  <UDashboardPanel :id="`desk-settings-${section}`">
    <template #header>
      <DeskNavbar :title="title" :description="description">
        <template #actions>
          <slot name="actions">
            <UButton
              v-if="pending !== undefined"
              color="neutral"
              variant="outline"
              icon="i-lucide-rotate-cw"
              :loading="pending"
              @click="emit('refresh')"
            >
              Refresh
            </UButton>
          </slot>
        </template>
      </DeskNavbar>
    </template>

    <template #body>
      <div class="mx-auto grid w-full max-w-6xl gap-6 pb-10 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <nav aria-label="Settings sections">
          <UNavigationMenu
            :items="navigationItems"
            orientation="horizontal"
            class="w-full overflow-x-auto lg:hidden"
          />
          <UNavigationMenu
            :items="navigationItems"
            orientation="vertical"
            class="hidden w-full lg:flex"
          />
        </nav>

        <main class="min-w-0">
          <slot />
        </main>
      </div>
    </template>
  </UDashboardPanel>
</template>
