<script setup lang="ts">
useHead(() => ({
  meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }]
}))
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
