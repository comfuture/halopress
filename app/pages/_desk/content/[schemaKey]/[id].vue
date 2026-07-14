<script setup lang="ts">
import type { BreadcrumbItem, DropdownMenuItem } from '@nuxt/ui'

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
const schemaKey = computed(() => String(route.params.schemaKey))
const id = computed(() => String(route.params.id))

const { data: schema } = await useFetch<any>(() => `/api/schema/${schemaKey.value}/active`)
const { data: doc, refresh: refreshDoc } = await useFetch<any>(() => `/api/content/${schemaKey.value}/${id.value}`)

const breadcrumbItems = computed<BreadcrumbItem[]>(() => ([
  { label: schema.value?.title || schemaKey.value, icon: 'i-lucide-files', to: `/_desk/content/${schemaKey.value}` },
  { label: doc.value?.content?.title || doc.value?.title || doc.value?.id || id.value }
]))

const state = reactive({
  content: {} as Record<string, any>
})

const contentFormRef = ref<any>(null)

function buildContentSnapshot() {
  return {
    content: state.content
  }
}

function buildContentSnapshotFromDoc(source: any) {
  return {
    content: source?.content || source?.extra || {}
  }
}

const savingDraft = ref(false)
const publishing = ref(false)

const lastSavedContentJson = ref('')
const currentContentJson = computed(() => stableStringify(buildContentSnapshot()))
const isDirty = computed(() => !!doc.value && currentContentJson.value !== lastSavedContentJson.value)
const canSaveDraft = computed(() => !!doc.value && isDirty.value && !savingDraft.value)
const canPublish = computed(() => !!doc.value && (
  isDirty.value || ['never-published', 'unpublished', 'published-with-draft'].includes(doc.value?.publicationState)
) && !publishing.value)
const canDiscard = computed(() => !!doc.value?.hasPublishedRevision && doc.value?.hasDraftChanges)
const canUnpublish = computed(() => !!doc.value?.hasPublishedRevision)

watch(
  () => doc.value,
  (next) => {
    if (!next) return
    state.content = { ...(next.content || next.extra || {}) }
    lastSavedContentJson.value = stableStringify(buildContentSnapshotFromDoc(next))
  },
  { immediate: true }
)

async function saveDraft() {
  if (!isDirty.value) return
  if (!(await contentFormRef.value?.validate?.())) {
    toast.add({ title: 'Fix validation errors', color: 'error' })
    return
  }
  savingDraft.value = true
  try {
    await $fetch(`/api/content/${schemaKey.value}/${id.value}`, {
      method: 'PUT',
      body: { status: 'draft', content: state.content }
    })
    toast.add({ title: 'Saved draft' })
    await refreshDoc()
  } catch (e: any) {
    toast.add({ title: 'Save failed', description: e?.statusMessage || 'Error', color: 'error' })
  } finally {
    savingDraft.value = false
  }
}

async function publish() {
  if (!canPublish.value) return
  if (!(await contentFormRef.value?.validate?.())) {
    toast.add({ title: 'Fix validation errors', color: 'error' })
    return
  }
  publishing.value = true
  try {
    await $fetch(`/api/content/${schemaKey.value}/${id.value}/publish`, {
      method: 'POST',
      body: { content: state.content }
    })
    toast.add({ title: 'Published' })
    await refreshDoc()
  } catch (e: any) {
    toast.add({ title: 'Publish failed', description: e?.statusMessage || 'Error', color: 'error' })
  } finally {
    publishing.value = false
  }
}

const discarding = ref(false)
async function discardDraft() {
  discarding.value = true
  try {
    await $fetch(`/api/content/${schemaKey.value}/${id.value}/discard`, { method: 'POST' })
    toast.add({ title: 'Draft discarded' })
    await refreshDoc()
  } catch (e: any) {
    toast.add({ title: 'Discard failed', description: e?.statusMessage || 'Error', color: 'error' })
  } finally {
    discarding.value = false
  }
}

const unpublishing = ref(false)
async function unpublish() {
  const ok = await confirm({
    title: 'Unpublish content',
    body: 'Anonymous delivery will stop, while the working draft is retained.',
    confirmLabel: 'Unpublish',
    confirmColor: 'warning'
  })
  if (!ok) return
  unpublishing.value = true
  try {
    await $fetch(`/api/content/${schemaKey.value}/${id.value}/unpublish`, { method: 'POST' })
    toast.add({ title: 'Unpublished' })
    await refreshDoc()
  } catch (e: any) {
    toast.add({ title: 'Unpublish failed', description: e?.statusMessage || 'Error', color: 'error' })
  } finally {
    unpublishing.value = false
  }
}

const removing = ref(false)
async function remove() {
  const ok = await confirm({
    title: 'Delete content',
    body: 'This will soft delete the content and it will no longer appear in the list.',
    confirmLabel: 'Delete',
    confirmColor: 'error'
  })
  if (!ok) return
  removing.value = true
  try {
    await $fetch(`/api/content/${schemaKey.value}/${id.value}`, { method: 'DELETE' })
    toast.add({ title: 'Deleted (soft)' })
    await navigateTo(`/_desk/content/${schemaKey.value}`)
  } catch (e: any) {
    toast.add({ title: 'Delete failed', description: e?.statusMessage || 'Error', color: 'error' })
  } finally {
    removing.value = false
  }
}

const actionMenuItems = computed<DropdownMenuItem[][]>(() => {
  const groups: DropdownMenuItem[][] = []

  if (canDiscard.value) {
    groups.push([{
      label: 'Discard draft',
      icon: 'i-lucide-rotate-ccw',
      disabled: discarding.value,
      onSelect: discardDraft
    }])
  }

  if (canUnpublish.value) {
    groups.push([{
      label: 'Unpublish',
      icon: 'i-lucide-eye-off',
      disabled: unpublishing.value,
      onSelect: unpublish
    }])
  }

  groups.push([{
    label: 'Delete',
    icon: 'i-lucide-trash-2',
    color: 'error',
    disabled: removing.value,
    onSelect: remove
  }])

  return groups
})
</script>

<template>
  <UDashboardPanel id="desk-content-edit">
    <template #header>
      <DeskNavbar
        :title="doc?.content?.title || doc?.title || doc?.id || id"
      >
        <template #title>
          <div class="flex flex-col min-w-0">
            <UBreadcrumb :items="breadcrumbItems" />
            <span class="text-xs text-muted truncate">{{ `${schema?.title || schemaKey} • ${doc?.publicationState || 'never-published'}` }}</span>
          </div>
        </template>

        <template #actions>
          <CmsEditorActions
            :preview-to="`/_preview/content/${schemaKey}/${id}`"
            :can-save-draft="canSaveDraft"
            :saving-draft="savingDraft"
            :can-publish="canPublish"
            :publishing="publishing"
            :menu-items="actionMenuItems"
            :menu-loading="discarding || unpublishing || removing"
            @save-draft="saveDraft"
            @publish="publish"
          />
        </template>
      </DeskNavbar>
    </template>

    <template #body>
      <CmsContentForm
        v-if="schema?.registry"
        ref="contentFormRef"
        :schema="schema"
        :model="state.content"
        class="shrink-0"
      />
    </template>
  </UDashboardPanel>
</template>
