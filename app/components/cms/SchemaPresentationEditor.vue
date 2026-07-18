<script setup lang="ts">
type Field = { id: string; key: string; kind: string; title?: string; system?: boolean }
type Presentation = {
  contractVersion: 1
  preset: 'generic' | 'article' | 'catalog'
  collectionTemplate: 'list' | 'cards' | 'catalog-grid'
  detailTemplate: 'document' | 'article' | 'catalog'
  layoutId?: string
  slugFieldId?: string
  structuredDataType?: 'WebPage' | 'Article' | 'BlogPosting' | 'NewsArticle' | 'Product'
  slots: Partial<Record<'title' | 'description' | 'image' | 'body' | 'gallery' | 'price', string>>
}

const props = defineProps<{
  modelValue: Presentation
  fields: Field[]
  publishedLayoutId?: string | null
  publishedVersion?: number | null
}>()
const emit = defineEmits<{ (e: 'update:modelValue', value: Presentation): void }>()

const presetOptions = [
  { label: 'Generic', value: 'generic', description: 'Stable fallback for any schema' },
  { label: 'Article', value: 'article', description: 'Editorial cards and long-form detail' },
  { label: 'Catalog', value: 'catalog', description: 'Visual grid and product-style detail' }
]
const collectionOptions = [
  { label: 'List', value: 'list' },
  { label: 'Cards', value: 'cards' },
  { label: 'Catalog grid', value: 'catalog-grid' }
]
const detailOptions = [
  { label: 'Document', value: 'document' },
  { label: 'Article', value: 'article' },
  { label: 'Catalog', value: 'catalog' }
]
const structuredDataOptions = [
  { label: 'Web page', value: 'WebPage' },
  { label: 'Article', value: 'Article' },
  { label: 'Blog post', value: 'BlogPosting' },
  { label: 'News article', value: 'NewsArticle' },
  { label: 'Product', value: 'Product' }
]

function options(kinds: string[]) {
  return props.fields.filter(field => !field.system && kinds.includes(field.kind)).map(field => ({
    label: field.title || field.key,
    value: field.id,
    description: field.key
  }))
}

const slotOptions = computed(() => ({
  title: options(['string', 'text']),
  description: options(['string', 'text', 'richtext']),
  image: options(['asset', 'asset_list']),
  body: options(['text', 'richtext']),
  gallery: options(['asset_list', 'asset']),
  price: options(['number', 'integer', 'string'])
}))
const slugOptions = computed(() => options(['string', 'text']))
const layoutId = computed<string | null>({
  get: () => props.modelValue.layoutId ?? null,
  set: (value) => {
    const next = { ...props.modelValue }
    if (value) next.layoutId = value
    else delete next.layoutId
    emit('update:modelValue', next)
  }
})
const layoutDescription = computed(() => {
  if (!props.publishedVersion) return 'Saved in the draft and committed to an exact Schema version on publish. Later Layout edits propagate live.'
  if (layoutId.value !== (props.publishedLayoutId ?? null)) {
    return `Draft and published v${props.publishedVersion} assignments differ. Public routes keep the published version until you publish.`
  }
  return `Draft and published v${props.publishedVersion} match and follow the current Layout revision.`
})

function first(kinds: string[], keys: string[]) {
  const fields = props.fields.filter(field => !field.system && kinds.includes(field.kind))
  return fields.find(field => keys.includes(field.key))?.id ?? fields[0]?.id
}

function update(patch: Partial<Presentation>) {
  emit('update:modelValue', { ...props.modelValue, ...patch })
}

function updateSlot(slot: keyof Presentation['slots'], fieldId: unknown) {
  const slots = { ...props.modelValue.slots }
  if (typeof fieldId === 'string' && fieldId) slots[slot] = fieldId
  else delete slots[slot]
  update({ slots })
}

function applyPreset(value: unknown) {
  if (value !== 'generic' && value !== 'article' && value !== 'catalog') return
  const slots: Presentation['slots'] = {
    title: first(['string', 'text'], ['title', 'name']),
    description: first(['string', 'text', 'richtext'], ['description', 'summary', 'excerpt']),
    image: first(['asset', 'asset_list'], ['image', 'cover', 'thumbnail', 'gallery']),
    body: first(['text', 'richtext'], ['body', 'content']),
    gallery: first(['asset_list', 'asset'], ['gallery', 'images', 'media']),
    price: first(['number', 'integer', 'string'], ['price', 'amount'])
  }
  for (const key of Object.keys(slots) as Array<keyof typeof slots>) if (!slots[key]) delete slots[key]
  emit('update:modelValue', {
    contractVersion: 1,
    preset: value,
    collectionTemplate: value === 'generic' ? 'list' : value === 'article' ? 'cards' : 'catalog-grid',
    detailTemplate: value === 'generic' ? 'document' : value,
    slugFieldId: props.modelValue.slugFieldId,
    structuredDataType: props.modelValue.structuredDataType
      ?? (value === 'article' ? 'Article' : value === 'catalog' ? 'Product' : 'WebPage'),
    ...(props.modelValue.layoutId ? { layoutId: props.modelValue.layoutId } : {}),
    slots
  })
}
</script>

<template>
  <fieldset class="min-w-0 space-y-4">
    <legend class="text-sm font-semibold text-highlighted">Public presentation</legend>
    <p class="text-sm text-muted">Choose a safe, versioned template and bind its regions to schema fields.</p>
    <LayoutAssignmentSelect
      v-model="layoutId"
      label="Presentation Layout"
      :description="layoutDescription"
      placeholder="Inherit the Site default Layout"
    />
    <div class="grid gap-4 md:grid-cols-3">
      <UFormField label="Preset">
        <USelectMenu :model-value="modelValue.preset" :items="presetOptions" value-key="value" label-key="label" class="w-full" @update:model-value="applyPreset" />
      </UFormField>
      <UFormField label="Collection template">
        <USelect :model-value="modelValue.collectionTemplate" :items="collectionOptions" class="w-full" @update:model-value="update({ collectionTemplate: $event as Presentation['collectionTemplate'] })" />
      </UFormField>
      <UFormField label="Detail template">
        <USelect :model-value="modelValue.detailTemplate" :items="detailOptions" class="w-full" @update:model-value="update({ detailTemplate: $event as Presentation['detailTemplate'] })" />
      </UFormField>
    </div>
    <div class="grid gap-4 md:grid-cols-2">
      <UFormField label="Slug source" description="Published values from this field generate stable content slugs.">
        <USelectMenu
          :model-value="modelValue.slugFieldId"
          :items="slugOptions"
          value-key="value"
          label-key="label"
          clear
          placeholder="Use the title mapping"
          class="w-full"
          @update:model-value="update({ slugFieldId: typeof $event === 'string' ? $event : undefined })"
        />
      </UFormField>
      <UFormField label="Structured data type" description="Only this safe schema.org type is emitted.">
        <USelect
          :model-value="modelValue.structuredDataType || 'WebPage'"
          :items="structuredDataOptions"
          class="w-full"
          @update:model-value="update({ structuredDataType: $event as Presentation['structuredDataType'] })"
        />
      </UFormField>
    </div>
    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <UFormField v-for="slot in (['title', 'description', 'image', 'body', 'gallery', 'price'] as const)" :key="slot" :label="`${slot[0]?.toUpperCase()}${slot.slice(1)} field`">
        <USelectMenu :model-value="modelValue.slots[slot]" :items="slotOptions[slot]" value-key="value" label-key="label" clear :placeholder="`Auto-select ${slot}`" class="w-full" @update:model-value="updateSlot(slot, $event)" />
      </UFormField>
    </div>
    <UAlert title="Bindings are checked on publish" description="Removed fields and incompatible field kinds are rejected before this presentation version becomes public." icon="i-lucide-shield-check" variant="subtle" />
  </fieldset>
</template>
