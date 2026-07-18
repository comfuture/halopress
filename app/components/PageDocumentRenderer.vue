<script setup lang="ts">
import {
  createPortablePageRendering,
  createPortableStandaloneDocument,
  type PortableDocumentRendering,
  type PortableThemeArtifact
} from '~~/shared/portable-content'

const props = withDefaults(defineProps<{
  document: unknown
  rendering?: PortableDocumentRendering | null
  isolated?: boolean
}>(), {
  rendering: null,
  isolated: false
})

const { theme, pending: themePending, error: themeError } = useSiteTheme()
const colorMode = useColorMode()
const renderedColorMode = computed(() => colorMode.preference === 'dark'
  ? 'dark'
  : (colorMode.preference === 'light' ? 'light' : 'default'))
const localRendering = computed(() => {
  if (!theme.value) return null
  const trustedOrigin = new URL(theme.value.stylesheetUrl).origin
  return createPortablePageRendering(props.document, {
    origin: trustedOrigin,
    theme: theme.value satisfies PortableThemeArtifact
  })
})
const activeRendering = computed(() => props.rendering?.contractVersion === 1
  && typeof props.rendering.html === 'string'
  && Array.isArray(props.rendering.stylesheets)
  ? props.rendering
  : localRendering.value)

const standaloneDocument = computed(() => activeRendering.value
  ? createPortableStandaloneDocument(activeRendering.value)
  : '')
const renderedHtml = computed(() => (activeRendering.value?.html ?? '').replace(
  /data-halo-color-mode="(?:default|light|dark)"/,
  `data-halo-color-mode="${renderedColorMode.value}"`
))

useHead(() => {
  const rendering = activeRendering.value
  return {
    link: props.isolated
      ? []
      : (rendering?.stylesheets ?? []).map(href => ({
        key: `halo-stylesheet-${href}`,
        rel: 'stylesheet',
        href
      }))
  }
})
</script>

<template>
  <iframe
    v-if="isolated && activeRendering"
    class="halo-preview-frame"
    :srcdoc="standaloneDocument"
    sandbox="allow-same-origin"
    referrerpolicy="no-referrer"
    title="Portable page preview"
    data-portable-content-isolated
  />
  <div
    v-else-if="isolated"
    class="halo-preview-loading"
    aria-live="polite"
    :aria-busy="themePending"
    data-portable-theme-pending
  >
    {{ themeError ? 'Theme preview is unavailable.' : 'Loading the published Theme…' }}
  </div>
  <div
    v-else-if="activeRendering"
    data-page-document-renderer
    data-portable-content-renderer
    v-html="renderedHtml"
  />
  <div v-else class="halo-preview-loading" aria-live="polite" :aria-busy="themePending">
    {{ themeError ? 'Portable content Theme is unavailable.' : 'Loading the published Theme…' }}
  </div>
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

.halo-preview-loading {
  display: grid;
  min-height: 12rem;
  place-items: center;
  color: #52525b;
  background: #ffffff;
  font: 0.875rem/1.5 ui-sans-serif, system-ui, sans-serif;
}
</style>
