<script setup lang="ts">
definePageMeta({ layout: 'desk' })
</script>

<template>
  <SiteAdminSection
    section="menus"
    title="Menus"
    description="Manage reusable static and dynamic navigation sets."
  >
    <UPageCard
      title="Menu sets are coming next"
      description="The current Navigation settings remain active while reusable menu sets and typed dynamic menu queries are introduced."
      icon="i-lucide-menu"
      variant="outline"
    >
      <template #footer>
        <UButton to="/_desk/settings/navigation" color="neutral" variant="outline" icon="i-lucide-external-link">
          Open Navigation settings
        </UButton>
      </template>
    </UPageCard>
  </SiteAdminSection>
</template>
