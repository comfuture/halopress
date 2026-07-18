<script setup lang="ts">
import type { Content } from '@tiptap/core'
import {
  createPortableRichTextRendering,
  type PortableRichTextFieldRendering,
  type PortableThemeArtifact
} from '~~/shared/portable-content'
import { formatPresentationDate, safePresentationLink } from '~/utils/schema-presentation'

const props = defineProps<{
  field: any
  value: unknown
  rendering?: PortableRichTextFieldRendering | null
  stylesheets?: string[]
}>()
const { theme, pending: themePending, error: themeError } = useSiteTheme()
const colorMode = useColorMode()
const renderedColorMode = computed(() => colorMode.preference === 'dark'
  ? 'dark'
  : (colorMode.preference === 'light' ? 'light' : 'default'))
const safeLink = computed(() => safePresentationLink(props.value))
const formattedDate = computed(() => formatPresentationDate(props.value, props.field.renderer === 'datetime'))
const localRendering = computed(() => {
  if (!theme.value) return null
  return createPortableRichTextRendering(props.value as Content, {
    origin: new URL(theme.value.stylesheetUrl).origin,
    theme: theme.value satisfies PortableThemeArtifact
  })
})
const richTextHtml = computed(() => (props.rendering?.html ?? localRendering.value?.html ?? '').replace(
  /data-halo-color-mode="(?:default|light|dark)"/,
  `data-halo-color-mode="${renderedColorMode.value}"`
))
const portableStylesheets = computed(() => props.stylesheets?.length
  ? props.stylesheets
  : (localRendering.value?.stylesheets ?? []))

useHead(() => ({
  link: props.field.renderer === 'rich_text'
    ? portableStylesheets.value.map(href => ({
        key: `halo-stylesheet-${href}`,
        rel: 'stylesheet',
        href
      }))
    : []
}))
</script>

<template>
  <div
    v-if="field.renderer === 'rich_text' && richTextHtml"
    data-portable-richtext-renderer
    v-html="richTextHtml"
  />
  <div
    v-else-if="field.renderer === 'rich_text'"
    aria-live="polite"
    :aria-busy="themePending"
    class="text-sm text-muted"
  >
    {{ themeError ? 'Portable content Theme is unavailable.' : 'Loading the published Theme…' }}
  </div>
  <PublicAssetGallery v-else-if="field.renderer === 'asset_gallery'" :value="value" :label="field.title" />
  <AssetImage v-else-if="field.renderer === 'asset' && typeof value === 'string'" :src="`/assets/${value}/raw`" :alt="field.title || ''" preset="content" sizes="(max-width: 768px) 100vw, 960px" class="max-h-[70vh] w-full rounded-xl bg-elevated object-contain" />
  <a v-else-if="field.renderer === 'link' && safeLink" :href="safeLink" class="text-primary underline underline-offset-4" rel="noopener noreferrer">{{ value }}</a>
  <UBadge v-else-if="field.renderer === 'badge'" color="neutral" variant="soft">{{ String(value) }}</UBadge>
  <span v-else-if="field.renderer === 'boolean'">{{ value ? 'Yes' : 'No' }}</span>
  <time v-else-if="field.renderer === 'date' || field.renderer === 'datetime'" :datetime="typeof value === 'string' ? value : undefined">{{ formattedDate }}</time>
  <span v-else-if="field.renderer === 'number'" class="tabular-nums">{{ typeof value === 'number' ? value.toLocaleString() : String(value) }}</span>
  <span v-else-if="field.renderer === 'reference' || field.renderer === 'reference_list'" class="text-muted">{{ Array.isArray(value) ? `${value.length} related items` : 'Related content' }}</span>
  <p v-else-if="field.renderer === 'long_text'" class="whitespace-pre-wrap text-pretty">{{ String(value) }}</p>
  <span v-else>{{ String(value) }}</span>
</template>
