<script setup lang="ts">
const route = useRoute()
</script>

<template>
  <div>
    <UHeader>
      <template #left>
        <NuxtLink to="/" class="flex items-center gap-2">
          <AppLogo class="w-auto h-6 shrink-0" />
          <span class="font-semibold">Halopress</span>
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
          © {{ new Date().getFullYear() }} Halopress
        </p>
      </template>
      <template #right>
        <span class="text-sm text-muted">{{ route.fullPath }}</span>
      </template>
    </UFooter>
  </div>
</template>

