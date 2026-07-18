<script setup lang="ts">
const { presentation } = await useSitePresentation()
const colorMode = useColorMode()
const route = useRoute()
const { theme: portableTheme } = useSiteTheme()

watchEffect(() => {
  // Desk retains its compatibility appearance preference. The public default
  // layout is the sole owner of the canonical active Theme preference.
  if (route.path === '/_desk' || route.path.startsWith('/_desk/')) {
    colorMode.preference = presentation.value.appearance.colorMode
  } else if ((route.path === '/_preview' || route.path.startsWith('/_preview/')) && portableTheme.value) {
    colorMode.preference = portableTheme.value.colorMode
  }
})

useHead(() => ({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' }
  ],
  link: presentation.value.general.faviconUrl === '/favicon.ico'
    ? [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'icon', type: 'image/png', sizes: '64x64', href: '/favicon.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' }
      ]
    : [
        { rel: 'icon', href: presentation.value.general.faviconUrl },
        { rel: 'apple-touch-icon', href: presentation.value.general.faviconUrl }
      ],
  htmlAttrs: {
    lang: presentation.value.general.locale
  }
}))

useSeoMeta({
  title: () => presentation.value.general.siteName,
  description: () => presentation.value.general.description,
  ogTitle: () => presentation.value.general.siteName,
  ogDescription: () => presentation.value.general.description,
  ogImage: () => presentation.value.general.socialImageUrl,
  twitterImage: () => presentation.value.general.socialImageUrl,
  twitterCard: 'summary_large_image'
})
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
