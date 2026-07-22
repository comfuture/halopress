<script setup lang="ts">
definePageMeta({ layout: 'desk' })

const route = useRoute()

onMounted(async () => {
  if (route.query.tab !== 'invites') return
  await nextTick()
  document.querySelector('#invitations, #membership')?.scrollIntoView({ block: 'start' })
})
</script>

<template>
  <SettingsShell
    section="access"
    title="Authentication & membership"
    description="Manage sign-in providers and decide how new public members receive access."
  >
    <div class="space-y-8">
      <SettingsAuthenticationPanel />
      <SettingsMembershipPanel />
    </div>
  </SettingsShell>
</template>
