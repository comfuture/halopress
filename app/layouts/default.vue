<script setup lang="ts">
const route = useRoute()
</script>

<template>
  <div>
    <UHeader>
      <template #left>
        <NuxtLink to="/" aria-label="HaloPress home">
          <AppLogo class="h-7 w-auto shrink-0" />
        </NuxtLink>
      </template>

      <template #right>
        <UButton
          to="/_desk"
          icon="i-lucide-layout-dashboard"
          color="neutral"
          variant="ghost"
        >
          Desk
        </UButton>
        <UColorModeButton />
      </template>
    </UHeader>

    <UMain>
      <NuxtPage />
    </UMain>

    <USeparator />

    <UFooter>
      <template #left>
        <p class="text-sm text-muted">
          © {{ new Date().getFullYear() }} HaloPress
        </p>
      </template>
      <template #right>
        <span class="text-sm text-muted">{{ route.fullPath }}</span>
      </template>
    </UFooter>
  </div>
</template>
