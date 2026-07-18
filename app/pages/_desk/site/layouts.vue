<script setup lang="ts">
definePageMeta({ layout: 'desk' })
</script>

<template>
  <SiteAdminSection
    section="layouts"
    title="Layouts"
    description="Manage HaloPress page-layout resources and rendering contracts."
  >
    <UPageCard
      title="SiteLayout resources are coming next"
      description="A SiteLayout will define the reusable public page structure selected by Site, Schema, and Page entities. SiteLayouts are persisted HaloPress resources and remain isolated from Nuxt application layouts and Desk UI."
      icon="i-lucide-panels-top-left"
      variant="outline"
    >
      <template #footer>
        <UButton to="/_desk/site" color="neutral" variant="outline" icon="i-lucide-arrow-left">
          Back to Site overview
        </UButton>
      </template>
    </UPageCard>
  </SiteAdminSection>
</template>
