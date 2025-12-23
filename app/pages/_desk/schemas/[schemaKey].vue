<script setup lang="ts">
import { ulid } from 'ulid'
import { z } from 'zod'
import type { SortableEvent } from 'sortablejs'
import { useSortable } from '@vueuse/integrations/useSortable'
import type { BreadcrumbItem } from '@nuxt/ui'

definePageMeta({
  layout: 'desk'
})

function stableStringify(value: any): string {
  const seen = new WeakSet()
  const normalize = (v: any): any => {
    if (v === null || typeof v !== 'object') return v
    if (seen.has(v)) return null
    seen.add(v)
    if (Array.isArray(v)) return v.map(normalize)
    const out: Record<string, any> = {}
    for (const k of Object.keys(v).sort()) out[k] = normalize(v[k])
    return out
  }
  return JSON.stringify(normalize(value))
}

const route = useRoute()
const toast = useToast()
const { confirm } = useConfirmDialog()

const routeKey = computed(() => String(route.params.schemaKey))
const isNew = computed(() => routeKey.value === 'new')

const schemaMetaFormRef = ref<any>(null)
const addFieldFormRef = ref<any>(null)
const editFieldFormRef = ref<any>(null)

const schemaKeyPattern = /^[a-z0-9][a-z0-9_]*$/
const fieldKeyPattern = /^[a-zA-Z][a-zA-Z0-9_]*$/

const schemaMetaSchema = z.object({
  schemaKey: z.string().min(1, 'Schema key is required').regex(schemaKeyPattern, 'Use lowercase letters, numbers, and underscores.'),
  title: z.string().optional(),
  description: z.string().optional()
}).loose()

const fieldDraftSchema = z.object({
  key: z.string().min(1, 'Key is required').regex(fieldKeyPattern, 'Use letters, numbers, and underscores. Must start with a letter.'),
  kind: z.string().min(1, 'Kind is required')
}).loose()

async function validateForm(form: any) {
  if (!form?.validate) return true
  try {
    await form.validate()
    return true
  } catch {
    return false
  }
}

const state = reactive({
  schemaKey: isNew.value ? '' : routeKey.value,
  title: '',
  description: '',
  fields: [] as any[]
})

const breadcrumbItems = computed<BreadcrumbItem[]>(() => ([
  { label: 'Schemas', to: '/_desk/schemas' },
  { label: isNew.value ? 'New' : (state.title || state.schemaKey) }
]))

const fieldsRef = toRef(state, 'fields')

const addFieldModalOpen = ref(false)
const editFieldModalOpen = ref(false)
const publishConfirmOpen = ref(false)
const publishMigrate = ref(false)
const editingIndex = ref<number | null>(null)

function buildAstFromState() {
  return {
    schemaKey: state.schemaKey,
    title: state.title || state.schemaKey,
    description: state.description || undefined,
    fields: state.fields
  }
}

const lastSavedAstJson = ref<string>(stableStringify(buildAstFromState()))
const currentAstJson = computed(() => stableStringify(buildAstFromState()))
const isDirty = computed(() => currentAstJson.value !== lastSavedAstJson.value)
const canSaveDraft = computed(() => !!state.schemaKey && isDirty.value && !saving.value)
const canPublish = computed(() => !!state.schemaKey && (isDirty.value || hasUnpublishedDraft.value) && !publishing.value)

const lastSort = ref<{ oldIndex: number | null; newIndex: number | null } | null>(null)

function moveField(from: number, to: number) {
  if (from === to) return
  const list = state.fields
  if (from < 0 || from >= list.length) return
  if (to < 0) to = 0
  if (to > list.length) to = list.length
  const [item] = list.splice(from, 1)
  if (item === undefined) return
  list.splice(to, 0, item)
}

const sortable = useSortable('.hp-sort-list', fieldsRef, {
  handle: '.hp-sort-handle',
  draggable: '.hp-sort-item',
  animation: 150,
  ghostClass: 'hp-sort-ghost',
  chosenClass: 'hp-sort-chosen',
  dragClass: 'hp-sort-drag',
  onUpdate: (e: SortableEvent) => {
    lastSort.value = { oldIndex: e.oldIndex ?? null, newIndex: e.newIndex ?? null }
    if (e.oldIndex == null || e.newIndex == null) return
    if (import.meta.dev) console.debug('[schema-sort] update', e.oldIndex, e.newIndex)
    moveField(e.oldIndex, e.newIndex)
  },
  disabled: false
})

onMounted(() => {
  nextTick(() => {
    sortable.start()
    sortable.option('disabled', addFieldModalOpen.value || editFieldModalOpen.value)
  })
})

watch([addFieldModalOpen, editFieldModalOpen], ([addOpen, editOpen]) => {
  sortable.option('disabled', addOpen || editOpen)
})

const { data: activeSchemas } = await useFetch<{ items: Array<{ schemaKey: string; title?: string }> }>('/api/schema/list')

const { data: draft, refresh: refreshDraft } = await useFetch<any>(() => `/api/schema/${routeKey.value}/draft`)

const activeFetch = isNew.value
  ? { data: ref<any>(null), refresh: async () => {} }
  : await useFetch<any>(() => `/api/schema/${routeKey.value}/active`)

const active = activeFetch.data
const refreshActive = activeFetch.refresh

const hasUnpublishedDraft = computed(() => {
  if (isNew.value) return false
  if (!draft.value) return false
  if (!active.value) return true
  return stableStringify(active.value.ast) !== currentAstJson.value
})

function deepClone<T>(value: T): T {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

watch(
  () => draft.value,
  (next) => {
    if (isNew.value) return
    if (!next) return
    state.schemaKey = next.schemaKey
    state.title = next.ast?.title ?? next.title ?? next.schemaKey
    state.description = next.ast?.description ?? ''
    state.fields = deepClone(next.ast?.fields ?? [])
    lastSavedAstJson.value = stableStringify(buildAstFromState())
  },
  { immediate: true }
)

const fieldDraft = reactive<any>({
  id: '',
  key: '',
  kind: 'string',
  title: '',
  description: '',
  required: false,
  enumValues: [] as any[],
  search: { mode: 'off', filterable: false, sortable: false },
  relTarget: 'system:User',
  relCardinality: 'one'
})

const editDraft = reactive<any>({
  id: '',
  key: '',
  kind: 'string',
  title: '',
  description: '',
  required: false,
  enumValues: [] as any[],
  search: { mode: 'off', filterable: false, sortable: false },
  relTarget: 'system:User',
  relCardinality: 'one'
})

const editKindSnapshot = ref<string | null>(null)
const skipKindConfirm = ref(false)

watch(editFieldModalOpen, (open) => {
  if (!open) {
    editingIndex.value = null
    editKindSnapshot.value = null
    return
  }
  editKindSnapshot.value = editDraft.kind
})

watch(publishConfirmOpen, (open) => {
  if (!open) publishMigrate.value = false
})

watch(
  () => editDraft.kind,
  async (next) => {
    if (!editFieldModalOpen.value) return
    if (skipKindConfirm.value) {
      skipKindConfirm.value = false
      return
    }
    if (!editKindSnapshot.value) {
      editKindSnapshot.value = next
      return
    }
    if (next === editKindSnapshot.value) return
    const ok = await confirm({
      title: 'Change field kind?',
      body: 'Changing the field kind can invalidate existing content. You can optionally migrate existing content when publishing.',
      confirmLabel: 'Change',
      confirmColor: 'warning'
    })
    if (!ok) {
      skipKindConfirm.value = true
      editDraft.kind = editKindSnapshot.value
      return
    }
    editKindSnapshot.value = next
  }
)

const fieldKindOptions = [
  { label: 'String', value: 'string' },
  { label: 'Text', value: 'text' },
  { label: 'Richtext (u-editor)', value: 'richtext' },
  { label: 'Enum', value: 'enum' },
  { label: 'Number', value: 'number' },
  { label: 'Integer', value: 'integer' },
  { label: 'Boolean', value: 'boolean' },
  { label: 'Date', value: 'date' },
  { label: 'Datetime', value: 'datetime' },
  { label: 'URL', value: 'url' },
  { label: 'Reference', value: 'reference' },
  { label: 'Asset', value: 'asset' }
]

const fieldKindIcon: Record<string, string> = {
  string: 'i-lucide-text-cursor-input',
  text: 'i-lucide-align-left',
  richtext: 'i-lucide-pen-line',
  enum: 'i-lucide-list',
  number: 'i-lucide-hash',
  integer: 'i-lucide-binary',
  boolean: 'i-lucide-toggle-left',
  date: 'i-lucide-calendar',
  datetime: 'i-lucide-calendar-clock',
  url: 'i-lucide-link',
  reference: 'i-lucide-link',
  asset: 'i-lucide-image'
}

function getFieldKindIcon(kind: string) {
  return fieldKindIcon[kind] ?? 'i-lucide-square-library'
}

const searchModeOptionsByKind: Record<string, Array<{ label: string; value: string }>> = {
  string: [
    { label: 'Off', value: 'off' },
    { label: 'Exact', value: 'exact' },
    { label: 'Exact set', value: 'exact_set' }
  ],
  text: [
    { label: 'Off', value: 'off' },
    { label: 'Exact', value: 'exact' },
    { label: 'Exact set', value: 'exact_set' }
  ],
  richtext: [
    { label: 'Off', value: 'off' },
    { label: 'Exact', value: 'exact' },
    { label: 'Exact set', value: 'exact_set' }
  ],
  url: [
    { label: 'Off', value: 'off' },
    { label: 'Exact', value: 'exact' },
    { label: 'Exact set', value: 'exact_set' }
  ],
  enum: [
    { label: 'Off', value: 'off' },
    { label: 'Exact', value: 'exact' },
    { label: 'Exact set', value: 'exact_set' }
  ],
  boolean: [
    { label: 'Off', value: 'off' },
    { label: 'Exact', value: 'exact' },
    { label: 'Exact set', value: 'exact_set' }
  ],
  number: [
    { label: 'Off', value: 'off' },
    { label: 'Exact', value: 'exact' },
    { label: 'Range', value: 'range' }
  ],
  integer: [
    { label: 'Off', value: 'off' },
    { label: 'Exact', value: 'exact' },
    { label: 'Range', value: 'range' }
  ],
  date: [
    { label: 'Off', value: 'off' },
    { label: 'Exact', value: 'exact' },
    { label: 'Range', value: 'range' }
  ],
  datetime: [
    { label: 'Off', value: 'off' },
    { label: 'Exact', value: 'exact' },
    { label: 'Range', value: 'range' }
  ]
}

const filterableKinds = new Set(['string', 'text', 'richtext', 'url', 'enum', 'boolean', 'number', 'integer', 'date', 'datetime'])
const sortableKinds = new Set(['string', 'url', 'enum', 'boolean', 'number', 'integer', 'date', 'datetime'])

function getSearchModeOptions(kind: string) {
  return searchModeOptionsByKind[kind] ?? [{ label: 'Off', value: 'off' }]
}

function defaultSearchMode(kind: string) {
  if (kind === 'number' || kind === 'integer' || kind === 'date' || kind === 'datetime') return 'range'
  return 'exact'
}

function normalizeSearchDraft(draft: any) {
  if (!draft.search) draft.search = { mode: 'off', filterable: false, sortable: false }
  const allowed = getSearchModeOptions(draft.kind).map(o => o.value)
  if (!allowed.includes(draft.search.mode)) draft.search.mode = 'off'
  if (!filterableKinds.has(draft.kind)) draft.search.filterable = false
  if (!sortableKinds.has(draft.kind)) draft.search.sortable = false
  if (draft.search.mode === 'off') {
    draft.search.filterable = false
    draft.search.sortable = false
  }
}

function formatKindLabel(kind: string, cardinality?: string) {
  if (kind === 'reference') return `reference (${cardinality || 'one'})`
  return kind
}

const kindChanges = computed(() => {
  const prevAst = active.value?.ast
  if (!prevAst) return []
  const prevById = new Map(prevAst.fields.map((field: any) => [field.id, field]))

  return state.fields
    .map((field: any) => {
      const prev = prevById.get(field.id)
      if (!prev) return null
      const prevCardinality = prev.rel?.cardinality ?? 'one'
      const nextCardinality = field.rel?.cardinality ?? 'one'
      const refCardinalityChanged = prev.kind === 'reference' && field.kind === 'reference' && prevCardinality !== nextCardinality
      if (prev.kind === field.kind && !refCardinalityChanged) return null
      return {
        id: field.id,
        key: field.key,
        title: field.title || field.key,
        fromKind: prev.kind,
        toKind: field.kind,
        fromCardinality: prevCardinality,
        toCardinality: nextCardinality,
        fromLabel: formatKindLabel(prev.kind, prevCardinality),
        toLabel: formatKindLabel(field.kind, nextCardinality)
      }
    })
    .filter(Boolean)
})

const contentSchemaOptions = computed(() => (activeSchemas.value?.items ?? []).map((s: any) => ({
  label: s.title ?? s.schemaKey,
  value: s.schemaKey
})))

function openNewField() {
  Object.assign(fieldDraft, {
    id: ulid(),
    key: '',
    kind: 'string',
    title: '',
    description: '',
    required: false,
    enumValues: [],
    search: { mode: 'off', filterable: false, sortable: false },
    relTarget: 'system:User',
    relCardinality: 'one'
  })
  normalizeSearchDraft(fieldDraft)
  addFieldModalOpen.value = true
}

function startEditField(index: number) {
  const f = state.fields[index]!
  const cloned = JSON.parse(JSON.stringify(f))
  Object.assign(editDraft, {
    id: cloned.id,
    key: cloned.key,
    kind: cloned.kind,
    title: cloned.title ?? '',
    description: cloned.description ?? '',
    required: !!cloned.required,
    enumValues: cloned.enumValues ?? [],
    search: cloned.search ?? { mode: 'off', filterable: false, sortable: false },
    relTarget: cloned.rel?.target ?? 'system:User',
    relCardinality: cloned.rel?.cardinality ?? 'one'
  })
  normalizeSearchDraft(editDraft)
  editingIndex.value = index
  editFieldModalOpen.value = true
}

function closeEditModal() {
  editFieldModalOpen.value = false
  editingIndex.value = null
}

function removeField(index: number) {
  if (editingIndex.value === index) closeEditModal()
  if (editingIndex.value !== null && editingIndex.value > index) editingIndex.value -= 1
  state.fields.splice(index, 1)
}

async function confirmRemoveField(index: number) {
  const field = state.fields[index]
  if (!field) return
  const label = field.title || field.key || 'this field'
  const ok = await confirm({
    title: 'Remove field',
    body: 'This change only affects the draft until you publish.',
    confirmLabel: 'Remove',
    confirmColor: 'error'
  })
  if (!ok) return
  removeField(index)
}

function normalizeFieldDraft(draft: any) {
  if (!draft.key) {
    toast.add({ title: 'Field key required', color: 'error' })
    return null
  }
  const next = JSON.parse(JSON.stringify(draft))

  if (next.kind !== 'enum') delete next.enumValues
  if (next.kind !== 'reference' && next.kind !== 'asset') {
    delete next.relTarget
    delete next.relCardinality
  }

  if (next.search) {
    normalizeSearchDraft(next)
    if (next.search.mode === 'off' && !next.search.filterable && !next.search.sortable) {
      delete next.search
    }
  }

  if (next.kind === 'asset') {
    next.rel = { kind: 'asset_ref', target: 'system:Asset', cardinality: 'one', editMode: 'pick' }
    delete next.relTarget
    delete next.relCardinality
  }
  if (next.kind === 'reference') {
    next.rel = {
      kind: next.relCardinality === 'many' ? 'ref_list' : 'ref',
      target: next.relTarget,
      cardinality: next.relCardinality,
      editMode: 'pick'
    }
    delete next.relTarget
    delete next.relCardinality
  }

  return next
}

watch(() => fieldDraft.kind, () => normalizeSearchDraft(fieldDraft))
watch(() => editDraft.kind, () => normalizeSearchDraft(editDraft))

watch(() => fieldDraft.search?.mode, (mode) => {
  if (!fieldDraft.search) return
  if (mode === 'off') {
    fieldDraft.search.filterable = false
    fieldDraft.search.sortable = false
  }
})

watch(() => editDraft.search?.mode, (mode) => {
  if (!editDraft.search) return
  if (mode === 'off') {
    editDraft.search.filterable = false
    editDraft.search.sortable = false
  }
})

watch(() => fieldDraft.search?.filterable, (val) => {
  if (!fieldDraft.search) return
  if (val && fieldDraft.search.mode === 'off') fieldDraft.search.mode = defaultSearchMode(fieldDraft.kind)
})

watch(() => fieldDraft.search?.sortable, (val) => {
  if (!fieldDraft.search) return
  if (val && fieldDraft.search.mode === 'off') fieldDraft.search.mode = defaultSearchMode(fieldDraft.kind)
})

watch(() => editDraft.search?.filterable, (val) => {
  if (!editDraft.search) return
  if (val && editDraft.search.mode === 'off') editDraft.search.mode = defaultSearchMode(editDraft.kind)
})

watch(() => editDraft.search?.sortable, (val) => {
  if (!editDraft.search) return
  if (val && editDraft.search.mode === 'off') editDraft.search.mode = defaultSearchMode(editDraft.kind)
})

async function addField() {
  if (!(await validateForm(addFieldFormRef.value))) return
  const next = normalizeFieldDraft(fieldDraft)
  if (!next) return
  state.fields.push(next)
  addFieldModalOpen.value = false
}

async function saveEdit() {
  if (!(await validateForm(editFieldFormRef.value))) return
  if (editingIndex.value === null) return
  const next = normalizeFieldDraft(editDraft)
  if (!next) return
  state.fields.splice(editingIndex.value, 1, next)
  closeEditModal()
}

const saving = ref(false)
async function saveDraft() {
  if (!(await validateForm(schemaMetaFormRef.value))) return
  if (!state.schemaKey) {
    toast.add({ title: 'schemaKey required', color: 'error' })
    return
  }
  if (!isDirty.value) return
  saving.value = true
  try {
    const ast = buildAstFromState()
    await $fetch(`/api/schema/${state.schemaKey}/draft`, {
      method: 'POST',
      body: { title: ast.title, ast }
    })
    lastSavedAstJson.value = stableStringify(ast)
    toast.add({ title: 'Draft saved' })
    if (isNew.value) await navigateTo(`/_desk/schemas/${state.schemaKey}`)
    await refreshDraft()
  } catch (e: any) {
    toast.add({ title: 'Save failed', description: e?.statusMessage || 'Error', color: 'error' })
  } finally {
    saving.value = false
  }
}

const publishing = ref(false)
async function performPublish(migrate: boolean) {
  if (!(await validateForm(schemaMetaFormRef.value))) return
  if (!state.schemaKey) {
    toast.add({ title: 'schemaKey required', color: 'error' })
    return
  }
  if (!isDirty.value && !hasUnpublishedDraft.value) return
  publishing.value = true
  try {
    const ast = buildAstFromState()
    // If there are unsaved changes, persist them first so publish always reflects the latest editor state.
    if (isDirty.value) {
      await $fetch(`/api/schema/${state.schemaKey}/draft`, {
        method: 'POST',
        body: { title: ast.title, ast }
      })
      lastSavedAstJson.value = stableStringify(ast)
    }

    const res = await $fetch(`/api/schema/${state.schemaKey}/publish`, {
      method: 'POST',
      body: { note: 'publish from desk', migrate }
    })
    toast.add({ title: 'Published', description: `v${(res as any).version}` })
    const targetPath = `/_desk/schemas/${state.schemaKey}`
    reloadNuxtApp({ path: targetPath })
    await Promise.allSettled([refreshDraft(), refreshActive()])
  } catch (e: any) {
    toast.add({ title: 'Publish failed', description: e?.statusMessage || 'Error', color: 'error' })
  } finally {
    publishing.value = false
  }
}

async function publish() {
  if (!(await validateForm(schemaMetaFormRef.value))) return
  if (!state.schemaKey) {
    toast.add({ title: 'schemaKey required', color: 'error' })
    return
  }
  if (!isDirty.value && !hasUnpublishedDraft.value) return
  if (kindChanges.value.length) {
    publishConfirmOpen.value = true
    return
  }
  await performPublish(false)
}

async function confirmPublish() {
  publishConfirmOpen.value = false
  await performPublish(publishMigrate.value)
}
</script>

<template>
  <UDashboardPanel id="desk-schema-editor">
    <template #header>
      <DeskNavbar
        :title="isNew ? 'New Schema' : `Schema: ${state.schemaKey}`"
      >
        <template #title>
          <div class="flex flex-col min-w-0">
            <UBreadcrumb :items="breadcrumbItems" />
            <span class="text-xs text-muted truncate">Edit draft and publish an immutable version.</span>
          </div>
        </template>

        <template #actions>
          <UButton
            icon="i-lucide-save"
            :loading="saving"
            :disabled="!canSaveDraft"
            aria-label="Save Draft"
            @click="saveDraft"
          >
            <span class="hidden sm:inline">Save Draft</span>
          </UButton>
          <UButton
            color="primary"
            icon="i-lucide-upload"
            :loading="publishing"
            :disabled="!canPublish"
            aria-label="Publish"
            @click="publish"
          >
            <span class="hidden sm:inline">Publish</span>
          </UButton>
        </template>
      </DeskNavbar>
    </template>

    <template #body>
      <UCard>
        <UForm
          ref="schemaMetaFormRef"
          :schema="schemaMetaSchema"
          :state="state"
          class="flex flex-col gap-4"
          @submit.prevent="saveDraft"
        >
          <UFormField v-if="isNew" name="schemaKey" label="Schema Key" help="lowercase, URL-friendly" required>
            <UInput
              v-model="state.schemaKey"
              name="schemaKey"
              required
              pattern="[a-z0-9][a-z0-9_]*"
              title="Use lowercase letters, numbers, and underscores. Must start with a letter/number."
              placeholder="article"
              autocapitalize="none"
              autocomplete="off"
              spellcheck="false"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Title">
            <UInput v-model="state.title" placeholder="Article" class="w-full" />
          </UFormField>

          <UFormField label="Description">
            <UInput v-model="state.description" placeholder="Optional" class="w-full" />
          </UFormField>
        </UForm>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <span class="font-medium">Fields</span>
            <UButton icon="i-lucide-plus" size="sm" @click="openNewField">
              Add field
            </UButton>
          </div>
        </template>
        <UPageList divide class="hp-sort-list">
          <div
            v-for="(f, i) in state.fields"
            :key="f.id"
            class="hp-sort-item py-2 w-full"
          >
            <div class="w-full flex items-start justify-between gap-2">
              <div class="min-w-0 flex items-start gap-2">
                <div class="hp-sort-handle mt-0.5 flex items-center justify-center text-muted cursor-grab active:cursor-grabbing select-none">
                  <UIcon name="i-lucide-grip-vertical" size="16" />
                </div>
                <UAvatar
                  :icon="getFieldKindIcon(f.kind)"
                  size="sm"
                  class="shrink-0"
                  :ui="{ root: 'bg-elevated', icon: 'text-muted' }"
                />
                <div class="min-w-0">
                  <div class="flex items-center gap-2 min-w-0">
                    <span class="font-medium truncate">{{ f.title || f.key }}</span>
                    <UBadge
                      v-if="!f.title"
                      size="xs"
                      color="neutral"
                      variant="soft"
                      class="shrink-0"
                    >
                      {{ f.kind }}
                    </UBadge>
                  </div>
                  <div v-if="f.title && f.title !== f.key" class="min-w-0 flex items-center gap-2 text-xs text-muted">
                    <span class="truncate">{{ f.key }}</span>
                    <UBadge size="xs" color="neutral" variant="soft" class="shrink-0">
                      {{ f.kind }}
                    </UBadge>
                  </div>
                </div>
              </div>

              <div class="flex gap-2 shrink-0">
                <UButton size="xs" color="neutral" variant="outline" icon="i-lucide-pencil" @click="startEditField(i)">
                  Edit
                </UButton>
                <UButton size="xs" color="error" variant="outline" icon="i-lucide-trash" @click="confirmRemoveField(i)">
                  Remove
                </UButton>
              </div>
            </div>
          </div>
        </UPageList>
      </UCard>
      <UModal
        v-model:open="addFieldModalOpen"
        title="New Field"
        description="Add a field to this schema."
      >
        <template #body>
          <UForm
            id="desk-add-field-form"
            ref="addFieldFormRef"
            :schema="fieldDraftSchema"
            :state="fieldDraft"
            class="space-y-4"
            @submit.prevent="addField"
          >
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <UFormField name="key" label="Key" help="JSON key (a-zA-Z0-9_)" required>
                <UInput
                  v-model="fieldDraft.key"
                  name="key"
                  required
                  pattern="[a-zA-Z][a-zA-Z0-9_]*"
                  title="Use letters, numbers, and underscores. Must start with a letter."
                  placeholder="body"
                  autocapitalize="none"
                  autocomplete="off"
                  spellcheck="false"
                />
              </UFormField>
              <UFormField name="kind" label="Kind" class="md:col-span-2" required>
                <USelect v-model="fieldDraft.kind" :items="fieldKindOptions" class="w-full" />
              </UFormField>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <UFormField label="Title">
                <UInput v-model="fieldDraft.title" placeholder="Body" />
              </UFormField>
              <UFormField label="Required">
                <USwitch v-model="fieldDraft.required" />
              </UFormField>
            </div>

            <div class="space-y-2">
              <div class="text-sm font-medium">Search / Filter / Sort</div>
              <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <UFormField label="Search mode">
                  <USelect v-model="fieldDraft.search.mode" :items="getSearchModeOptions(fieldDraft.kind)" class="w-full" />
                </UFormField>
                <UFormField label="Filterable">
                  <USwitch
                    v-model="fieldDraft.search.filterable"
                    :disabled="!filterableKinds.has(fieldDraft.kind) || fieldDraft.search.mode === 'off'"
                  />
                </UFormField>
                <UFormField label="Sortable">
                  <USwitch
                    v-model="fieldDraft.search.sortable"
                    :disabled="!sortableKinds.has(fieldDraft.kind) || fieldDraft.search.mode === 'off'"
                  />
                </UFormField>
              </div>
            </div>

            <div v-if="fieldDraft.kind === 'enum'" class="space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium">Enum values</span>
                <UButton
                  size="xs"
                  color="neutral"
                  variant="outline"
                  icon="i-lucide-plus"
                  @click="fieldDraft.enumValues.push({ label: '', value: '' })"
                >
                  Add
                </UButton>
              </div>
              <div v-for="(ev, i) in fieldDraft.enumValues" :key="i" class="grid grid-cols-2 gap-2">
                <UInput v-model="ev.label" placeholder="Label" />
                <UInput v-model="ev.value" placeholder="value" />
              </div>
            </div>

            <div v-if="fieldDraft.kind === 'reference'" class="space-y-3">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <UFormField label="Target">
                  <USelect
                    v-model="fieldDraft.relTarget"
                    :items="[
                      { label: 'system:User', value: 'system:User' },
                      { label: 'system:Asset', value: 'system:Asset' },
                      ...contentSchemaOptions.map((o: any) => ({ label: `content:${o.value}`, value: `content:${o.value}` }))
                    ]"
                  />
                </UFormField>
                <UFormField label="Cardinality">
                  <USelect
                    v-model="fieldDraft.relCardinality"
                    :items="[
                      { label: 'one', value: 'one' },
                      { label: 'many', value: 'many' }
                    ]"
                  />
                </UFormField>
              </div>
              <UAlert
                title="MVP limitation"
                description="Only top-level reference fields are supported."
                icon="i-lucide-info"
                variant="subtle"
              />
            </div>
          </UForm>
        </template>

        <template #footer="{ close }">
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="outline" @click="close()">
              Cancel
            </UButton>
            <UButton icon="i-lucide-check" type="submit" form="desk-add-field-form">
              Add
            </UButton>
          </div>
        </template>
      </UModal>

      <UModal
        v-model:open="editFieldModalOpen"
        title="Edit Field"
        description="Update field properties."
      >
        <template #body>
          <UForm
            id="desk-edit-field-form"
            ref="editFieldFormRef"
            :schema="fieldDraftSchema"
            :state="editDraft"
            class="space-y-4"
            @submit.prevent="saveEdit"
          >
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <UFormField name="key" label="Key" help="JSON key (a-zA-Z0-9_)" required>
                <UInput
                  v-model="editDraft.key"
                  name="key"
                  required
                  pattern="[a-zA-Z][a-zA-Z0-9_]*"
                  title="Use letters, numbers, and underscores. Must start with a letter."
                  placeholder="body"
                  autocapitalize="none"
                  autocomplete="off"
                  spellcheck="false"
                />
              </UFormField>
              <UFormField name="kind" label="Kind" class="md:col-span-2" required>
                <USelect v-model="editDraft.kind" :items="fieldKindOptions" class="w-full" />
              </UFormField>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <UFormField label="Title">
                <UInput v-model="editDraft.title" placeholder="Body" />
              </UFormField>
              <UFormField label="Required">
                <USwitch v-model="editDraft.required" />
              </UFormField>
            </div>

            <div class="space-y-2">
              <div class="text-sm font-medium">Search / Filter / Sort</div>
              <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <UFormField label="Search mode">
                  <USelect v-model="editDraft.search.mode" :items="getSearchModeOptions(editDraft.kind)" class="w-full" />
                </UFormField>
                <UFormField label="Filterable">
                  <USwitch
                    v-model="editDraft.search.filterable"
                    :disabled="!filterableKinds.has(editDraft.kind) || editDraft.search.mode === 'off'"
                  />
                </UFormField>
                <UFormField label="Sortable">
                  <USwitch
                    v-model="editDraft.search.sortable"
                    :disabled="!sortableKinds.has(editDraft.kind) || editDraft.search.mode === 'off'"
                  />
                </UFormField>
              </div>
            </div>

            <div v-if="editDraft.kind === 'enum'" class="space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium">Enum values</span>
                <UButton
                  size="xs"
                  color="neutral"
                  variant="outline"
                  icon="i-lucide-plus"
                  @click="editDraft.enumValues.push({ label: '', value: '' })"
                >
                  Add
                </UButton>
              </div>
              <div v-for="(ev, i) in editDraft.enumValues" :key="i" class="grid grid-cols-2 gap-2">
                <UInput v-model="ev.label" placeholder="Label" />
                <UInput v-model="ev.value" placeholder="value" />
              </div>
            </div>

            <div v-if="editDraft.kind === 'reference'" class="space-y-3">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <UFormField label="Target">
                  <USelect
                    v-model="editDraft.relTarget"
                    :items="[
                      { label: 'system:User', value: 'system:User' },
                      { label: 'system:Asset', value: 'system:Asset' },
                      ...contentSchemaOptions.map((o: any) => ({ label: `content:${o.value}`, value: `content:${o.value}` }))
                    ]"
                  />
                </UFormField>
                <UFormField label="Cardinality">
                  <USelect
                    v-model="editDraft.relCardinality"
                    :items="[
                      { label: 'one', value: 'one' },
                      { label: 'many', value: 'many' }
                    ]"
                  />
                </UFormField>
              </div>
              <UAlert
                title="MVP limitation"
                description="Only top-level reference fields are supported."
                icon="i-lucide-info"
                variant="subtle"
              />
            </div>
          </UForm>
        </template>

        <template #footer="{ close }">
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="outline" @click="closeEditModal(); close()">
              Cancel
            </UButton>
            <UButton icon="i-lucide-check" type="submit" form="desk-edit-field-form">
              Save
            </UButton>
          </div>
        </template>
      </UModal>

      <UModal
        v-model:open="publishConfirmOpen"
        title="Review breaking changes"
        description="Field kind changes affect existing content."
      >
        <template #body>
          <div class="flex flex-col gap-4">
            <UAlert
              title="Existing content is not automatically converted."
              description="You can publish without migration, or apply a best-effort migration to update existing content to the new schema version."
              icon="i-lucide-info"
              variant="subtle"
            />
            <div class="space-y-2">
              <div class="text-sm font-medium">Changed fields</div>
              <div class="flex flex-col gap-2">
                <div
                  v-for="change in kindChanges"
                  :key="change.id"
                  class="flex items-center justify-between gap-3 rounded-md border border-muted/30 px-3 py-2 text-sm"
                >
                  <div class="min-w-0">
                    <div class="font-medium truncate">{{ change.title }}</div>
                    <div class="text-xs text-muted truncate">{{ change.key }}</div>
                  </div>
                  <div class="flex items-center gap-2 shrink-0">
                    <UBadge size="xs" color="neutral" variant="soft">{{ change.fromLabel }}</UBadge>
                    <UIcon name="i-lucide-arrow-right" size="14" class="text-muted" />
                    <UBadge size="xs" color="primary" variant="soft">{{ change.toLabel }}</UBadge>
                  </div>
                </div>
              </div>
            </div>
            <UCheckbox
              v-model="publishMigrate"
              label="Apply migration to existing content"
              description="Best-effort conversion and schemaVersion update."
            />
          </div>
        </template>

        <template #footer="{ close }">
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="outline" @click="close()">
              Cancel
            </UButton>
            <UButton icon="i-lucide-upload" color="primary" :loading="publishing" @click="confirmPublish()">
              Publish
            </UButton>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
