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
      title="Layout resource foundation is ready"
      description="Validated Layout resources define reusable public page structure for future Site, Schema, and Page assignments. The visual Layout editor arrives in #71; persisted Layouts remain isolated from Nuxt application layouts and Desk UI."
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
