<script setup lang="ts">
const route = useRoute()
const { presentation } = await useSitePresentation()

const navigationItems = computed(() => siteNavigationItems(presentation.value, route.path))
const footerLinks = computed(() => siteFooterLinks(presentation.value, route.path))
const themeStyle = computed(() => siteThemeStyle(presentation.value))
const copyright = computed(() => presentation.value.footer.copyright
  || `© ${new Date().getFullYear()} ${presentation.value.general.siteName}`)
const headerUi = computed(() => {
  if (presentation.value.shell.headerVariant === 'minimal') return { root: 'border-b-0' }
  if (presentation.value.shell.headerVariant === 'centered') return { left: 'md:flex-1', center: 'md:flex-none', right: 'md:flex-1 md:justify-end' }
  return {}
})
</script>

<template>
  <div
    class="site-shell"
    :style="themeStyle"
    :data-theme-preset="presentation.appearance.preset"
    :data-shell-width="presentation.shell.width"
  >
    <UHeader
      :title="presentation.general.siteName"
      mode="drawer"
      :toggle="navigationItems.length > 0"
      :ui="headerUi"
    >
      <template #left>
        <NuxtLink to="/" :aria-label="`${presentation.general.siteName} home`" class="h-7">
          <SiteLogo
            :site-name="presentation.general.siteName"
            :logo-url="presentation.general.logoUrl"
            class="h-7 w-auto shrink-0"
          />
        </NuxtLink>
      </template>

      <UNavigationMenu
        v-if="navigationItems.length"
        :items="navigationItems"
        class="hidden md:flex"
      />

      <template #right>
        <UButton
          v-if="presentation.shell.showDeskLink"
          to="/_desk"
          icon="i-lucide-layout-dashboard"
          color="neutral"
          variant="ghost"
        >
          Desk
        </UButton>
        <UColorModeButton v-if="presentation.shell.showColorMode" />
      </template>

      <template #body>
        <UNavigationMenu :items="navigationItems" orientation="vertical" class="-mx-2.5" />
      </template>
    </UHeader>

    <UMain>
      <NuxtPage />
    </UMain>

    <USeparator />

    <UFooter>
      <template #left>
        <p class="text-sm text-muted">
          {{ copyright }}
        </p>
      </template>
      <template #right>
        <UNavigationMenu
          v-if="presentation.footer.variant === 'links' && footerLinks.length"
          :items="footerLinks"
        />
        <span v-else-if="presentation.footer.showRoute" class="text-sm text-muted">{{ route.fullPath }}</span>
      </template>
    </UFooter>
  </div>
</template>
