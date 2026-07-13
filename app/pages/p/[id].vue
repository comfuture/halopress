<script setup lang="ts">
const route = useRoute()
const id = computed(() => String(route.params.id))
const { data: page, error } = await useFetch<any>(() => `/api/delivery/page/${id.value}`)

if (error.value || !page.value) {
  throw createError({ statusCode: 404, statusMessage: 'Page not found' })
}

useSeoMeta({
  title: () => page.value?.title || 'Page'
})
</script>

<template>
  <UContainer class="py-8">
    <UPage>
      <UPageHeader :title="page?.title || 'Untitled page'" />
      <UPageBody>
        <PageDocumentRenderer :document="page?.content" />
      </UPageBody>
    </UPage>
  </UContainer>
</template>
