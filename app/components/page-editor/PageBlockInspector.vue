<script setup lang="ts">
import { resolvePageBlock } from '~~/shared/page-blocks'

import {
  commitPageBlockLink,
  createPageBlockLinkDrafts,
  movePageBlockLink,
  type PageBlockLinkDraft
} from '~/editor/page/links'
import type { PageBlockAttrs, PageBlockField } from '~/editor/page/types'

const props = defineProps<{
  attrs: PageBlockAttrs | null
  fields: PageBlockField[]
  label?: string
  editable?: boolean
}>()

const emit = defineEmits<{
  update: [attrs: PageBlockAttrs]
}>()

const editing = reactive<{
  component: string
  props: Record<string, any>
  advanced: Record<string, unknown>
  media: PageBlockAttrs['media']
}>({
  component: 'pageHero',
  props: {},
  advanced: {},
  media: { url: '', alt: '' }
})
const syncing = ref(false)
const linkDrafts = ref<PageBlockLinkDraft[]>([])
const advancedText = ref('{}')
const advancedError = ref<string>()
let commitTimer: ReturnType<typeof setTimeout> | undefined

const linkTargetOptions = [
  { label: 'Same tab', value: '_self' },
  { label: 'New tab', value: '_blank' }
]
const linkColorOptions = ['primary', 'secondary', 'success', 'info', 'warning', 'error', 'neutral']
  .map(value => ({ label: value[0]!.toUpperCase() + value.slice(1), value }))
const linkVariantOptions = ['solid', 'outline', 'soft', 'subtle', 'ghost', 'naked']
  .map(value => ({ label: value[0]!.toUpperCase() + value.slice(1), value }))
const iconOptions = [
  'i-lucide-arrow-right',
  'i-lucide-badge-check',
  'i-lucide-book-open',
  'i-lucide-circle-help',
  'i-lucide-external-link',
  'i-lucide-heart',
  'i-lucide-sparkles',
  'i-lucide-star'
].map(value => ({ label: value.replace('i-lucide-', ''), value, icon: value }))

function cloneAttrs(attrs: PageBlockAttrs): PageBlockAttrs {
  return structuredClone(attrs)
}

function samePageBlockAttrs(attrs: PageBlockAttrs) {
  return editing.component === attrs.component
    && JSON.stringify(editing.props) === JSON.stringify(attrs.props)
    && JSON.stringify(editing.advanced) === JSON.stringify(attrs.advanced)
    && JSON.stringify(editing.media) === JSON.stringify(attrs.media)
}

function resetFromAttrs(attrs: PageBlockAttrs | null) {
  if (!attrs) return
  if (samePageBlockAttrs(attrs)) return
  if (commitTimer) {
    clearTimeout(commitTimer)
    commitTimer = undefined
  }
  syncing.value = true
  const next = cloneAttrs(attrs)
  editing.component = next.component
  editing.props = next.props
  editing.advanced = next.advanced
  editing.media = next.media
  linkDrafts.value = createPageBlockLinkDrafts(editing.props.links)
  advancedText.value = JSON.stringify(editing.advanced, null, 2)
  advancedError.value = undefined
  nextTick(() => {
    syncing.value = false
  })
}

watch(() => props.attrs, resetFromAttrs, { immediate: true, deep: true })

function queueCommit() {
  if (syncing.value || !props.attrs || !props.editable) return
  if (commitTimer) clearTimeout(commitTimer)
  commitTimer = setTimeout(() => emit('update', cloneAttrs(editing)), 180)
}

watch(editing, queueCommit, { deep: true })
onBeforeUnmount(() => {
  if (commitTimer) clearTimeout(commitTimer)
})

const validationMessage = computed(() => {
  if (!props.attrs) return undefined
  const resolved = resolvePageBlock(editing)
  return resolved.status === 'malformed' ? resolved.reason : undefined
})

function addLink() {
  if (linkDrafts.value.length >= 12) return
  linkDrafts.value.push({
    label: '',
    to: '',
    target: '_self',
    icon: '',
    color: 'primary',
    variant: 'solid',
    original: {}
  })
  commitLink(linkDrafts.value.length - 1)
}

function commitLink(index: number) {
  const draft = linkDrafts.value[index]
  if (!draft) return
  const result = commitPageBlockLink(editing.props.links, index, draft)
  draft.error = result.error
  if (!result.links) return
  editing.props.links = result.links
  draft.original = { ...result.links[index] }
}

function updateLink(index: number, field: keyof PageBlockLinkDraft, value: unknown) {
  const draft = linkDrafts.value[index]
  if (!draft || field === 'original' || field === 'error') return
  if (field === 'target') {
    if (value !== '_self' && value !== '_blank') return
    draft.target = value
  } else if (typeof value === 'string') {
    draft[field] = value
  }
  commitLink(index)
}

function removeLink(index: number) {
  linkDrafts.value.splice(index, 1)
  const current = Array.isArray(editing.props.links) ? editing.props.links : []
  editing.props.links = current.filter((_item, itemIndex) => itemIndex !== index)
}

function moveLink(index: number, direction: -1 | 1) {
  const result = movePageBlockLink(linkDrafts.value, editing.props.links, index, direction)
  if (!result) return
  linkDrafts.value = result.drafts
  editing.props.links = result.links
}

const selectedAssetId = computed<string | null>({
  get() {
    const url = editing.media.url || ''
    const match = url.match(/^\/assets\/([^/?#]+)\/raw(?:[?#].*)?$/)
    if (!match?.[1]) return null
    try {
      return decodeURIComponent(match[1])
    } catch {
      return match[1]
    }
  },
  set(assetId) {
    editing.media.url = assetId ? `/assets/${encodeURIComponent(assetId)}/raw` : ''
  }
})
const hasLegacyMediaUrl = computed(() => !!editing.media.url && !selectedAssetId.value)

function commitAdvanced() {
  try {
    const parsed = JSON.parse(advancedText.value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      advancedError.value = 'Advanced properties must be a JSON object.'
      return
    }
    editing.advanced = parsed
    advancedError.value = undefined
  } catch {
    advancedError.value = 'Enter valid JSON before applying advanced properties.'
  }
}

function resetAdvanced() {
  advancedText.value = '{}'
  advancedError.value = undefined
  editing.advanced = {}
}
</script>

<template>
  <section aria-labelledby="page-editor-properties" class="flex h-full min-h-0 flex-col">
    <div class="border-b border-muted px-4 py-3">
      <h2 id="page-editor-properties" class="text-sm font-semibold text-highlighted">
        Inspector
      </h2>
      <p class="mt-1 text-xs text-muted">
        {{ attrs ? `Editing ${label || attrs.component}` : 'Select a block on the canvas.' }}
      </p>
    </div>

    <div v-if="!attrs" class="p-4 text-sm text-muted">
      Select a block to edit its properties.
    </div>

    <div v-else class="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
      <UAlert
        v-if="validationMessage"
        title="This block has invalid properties"
        :description="validationMessage"
        color="error"
        variant="subtle"
        icon="i-lucide-triangle-alert"
      />

      <fieldset class="m-0 min-w-0 space-y-3 border-0 p-0" :disabled="!editable">
        <legend class="mb-3 text-xs font-medium text-muted">Media</legend>
        <CmsAssetPicker v-model="selectedAssetId" label="Image asset" />
        <UAlert
          v-if="hasLegacyMediaUrl"
          title="Legacy image URL"
          :description="editing.media.url"
          color="neutral"
          variant="subtle"
          icon="i-lucide-link"
        />
        <UFormField label="Alternative text">
          <UInput v-model="editing.media.alt" placeholder="Describe the image" class="w-full" />
        </UFormField>
      </fieldset>

      <fieldset class="m-0 min-w-0 space-y-3 border-0 p-0" :disabled="!editable">
        <legend class="mb-3 text-xs font-medium text-muted">{{ label || 'Block' }}</legend>
        <UFormField v-for="field in fields" :key="field.key" :label="field.label" :help="field.help">
          <UInput v-if="field.type === 'text'" v-model="editing.props[field.key]" :placeholder="field.placeholder" class="w-full" />
          <UInput v-else-if="field.type === 'url'" v-model="editing.props[field.key]" type="url" :placeholder="field.placeholder || 'https://'" class="w-full" />
          <UTextarea v-else-if="field.type === 'textarea'" v-model="editing.props[field.key]" :placeholder="field.placeholder" class="w-full" />
          <USelect v-else-if="['select', 'color-token', 'spacing'].includes(field.type)" v-model="editing.props[field.key]" :items="field.options || []" class="w-full" />
          <USwitch v-else-if="field.type === 'boolean'" v-model="editing.props[field.key]" />
          <UInputMenu
            v-else-if="field.type === 'icon'"
            v-model="editing.props[field.key]"
            :items="iconOptions"
            value-key="value"
            label-key="label"
            placeholder="Choose an icon"
            class="w-full"
          />
          <div v-else-if="field.type === 'link-list'" class="space-y-3">
            <fieldset v-for="(link, index) in linkDrafts" :key="index" class="m-0 space-y-3 rounded-md border border-muted p-3">
              <legend class="px-1 text-xs font-medium text-muted">Link {{ index + 1 }}</legend>
              <div class="flex justify-end gap-1">
                <UButton type="button" aria-label="Move link up" icon="i-lucide-arrow-up" color="neutral" variant="ghost" size="xs" :disabled="index === 0" @click="moveLink(index, -1)" />
                <UButton type="button" aria-label="Move link down" icon="i-lucide-arrow-down" color="neutral" variant="ghost" size="xs" :disabled="index === linkDrafts.length - 1" @click="moveLink(index, 1)" />
                <UButton type="button" aria-label="Remove link" icon="i-lucide-trash" color="error" variant="ghost" size="xs" @click="removeLink(index)" />
              </div>
              <UFormField label="Label"><UInput :model-value="link.label" class="w-full" @update:model-value="updateLink(index, 'label', $event)" /></UFormField>
              <UFormField label="Destination" :error="link.error"><UInput :model-value="link.to" placeholder="/path, #section, or https://" class="w-full" @update:model-value="updateLink(index, 'to', $event)" /></UFormField>
              <UFormField label="Target"><USelect :model-value="link.target" :items="linkTargetOptions" class="w-full" @update:model-value="updateLink(index, 'target', $event)" /></UFormField>
              <UFormField label="Icon"><UInputMenu :model-value="link.icon" :items="iconOptions" value-key="value" label-key="label" class="w-full" @update:model-value="updateLink(index, 'icon', $event)" /></UFormField>
              <div class="grid grid-cols-2 gap-2">
                <UFormField label="Color"><USelect :model-value="link.color" :items="linkColorOptions" class="w-full" @update:model-value="updateLink(index, 'color', $event)" /></UFormField>
                <UFormField label="Style"><USelect :model-value="link.variant" :items="linkVariantOptions" class="w-full" @update:model-value="updateLink(index, 'variant', $event)" /></UFormField>
              </div>
            </fieldset>
            <UButton type="button" label="Add link" icon="i-lucide-plus" color="neutral" variant="soft" size="sm" :disabled="linkDrafts.length >= 12" @click="addLink" />
          </div>
        </UFormField>
      </fieldset>

      <UCollapsible :unmount-on-hide="false">
        <UButton label="Advanced properties" icon="i-lucide-code-xml" color="neutral" variant="ghost" block />
        <template #content>
          <div class="space-y-3 pt-3">
            <UAlert title="Portable JSON only" description="Advanced values are retained but are not trusted as component code, classes, or event handlers." color="warning" variant="subtle" />
            <UFormField label="Advanced JSON" :error="advancedError">
              <UTextarea v-model="advancedText" :rows="8" class="w-full font-mono text-xs" @blur="commitAdvanced" />
            </UFormField>
            <div class="flex gap-2">
              <UButton label="Apply" color="neutral" variant="soft" size="sm" @click="commitAdvanced" />
              <UButton label="Reset" color="neutral" variant="ghost" size="sm" @click="resetAdvanced" />
            </div>
          </div>
        </template>
      </UCollapsible>
    </div>
  </section>
</template>
