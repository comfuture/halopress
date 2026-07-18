<script setup lang="ts">
import {
  createPortablePageRendering,
  createPortableStandaloneDocument,
  type PortableDocumentRendering
} from '~~/shared/portable-content'

const props = withDefaults(defineProps<{
  document: unknown
  rendering?: PortableDocumentRendering | null
  isolated?: boolean
}>(), {
  rendering: null,
  isolated: false
})

const requestUrl = useRequestURL()
const localRendering = computed(() => createPortablePageRendering(props.document, {
  origin: requestUrl.origin
}))
const activeRendering = computed(() => props.rendering?.contractVersion === 1
  && typeof props.rendering.html === 'string'
  && Array.isArray(props.rendering.stylesheets)
  ? props.rendering
  : localRendering.value)

const standaloneDocument = computed(() => createPortableStandaloneDocument(activeRendering.value))

useHead(() => ({
  link: props.isolated
    ? []
    : activeRendering.value.stylesheets.map(href => ({
        key: `halo-portable-content-${activeRendering.value.contractVersion}-${href}`,
        rel: 'stylesheet',
        href
      }))
}))
</script>

<template>
  <iframe
    v-if="isolated"
    class="halo-preview-frame"
    :srcdoc="standaloneDocument"
    sandbox="allow-same-origin"
    referrerpolicy="no-referrer"
    title="Portable page preview"
    data-portable-content-isolated
  />
  <div
    v-else
    data-page-document-renderer
    data-portable-content-renderer
    v-html="activeRendering.html"
  />
</template>

<style scoped>
.halo-preview-frame {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 32rem;
  border: 0;
  background: #ffffff;
}
</style>
