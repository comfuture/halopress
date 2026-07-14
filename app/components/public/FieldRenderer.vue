<script setup lang="ts">
import type { Content } from '@tiptap/core'
const props = defineProps<{ field: any; value: unknown }>()
const safeLink = computed(() => {
  if (typeof props.value !== 'string') return null
  try {
    const url = new URL(props.value)
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null
  } catch { return null }
})
const formattedDate = computed(() => {
  if (typeof props.value !== 'string') return ''
  const date = new Date(props.value)
  return Number.isNaN(date.getTime()) ? props.value : new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    ...(props.field.renderer === 'datetime' ? { timeStyle: 'short' } : {})
  }).format(date)
})
</script>

<template>
  <CmsRichEditor v-if="field.renderer === 'rich_text'" :model-value="value as Content" :editable="false" class="min-h-0 w-full" />
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
