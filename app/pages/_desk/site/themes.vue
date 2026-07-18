<script setup lang="ts">
definePageMeta({ layout: 'desk' })
</script>

<template>
  <SiteAdminSection
    section="themes"
    title="Themes"
    description="Manage reusable visual tokens for Site content."
  >
    <UPageCard
      title="Theme resources are coming next"
      description="The current Appearance settings remain active while the standalone Theme contract and CSS publishing pipeline are introduced."
      icon="i-lucide-palette"
      variant="outline"
    >
      <template #footer>
        <UButton to="/_desk/settings/appearance" color="neutral" variant="outline" icon="i-lucide-external-link">
          Open Appearance settings
        </UButton>
      </template>
    </UPageCard>
  </SiteAdminSection>
</template>
