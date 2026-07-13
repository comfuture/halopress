<script setup lang="ts">
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
          <UButton
            :to="`/_preview/content/${schemaKey}/${id}`"
            target="_blank"
            color="neutral"
            variant="ghost"
            icon="i-lucide-eye"
          >
            <span class="hidden sm:inline">Preview draft</span>
          </UButton>
          <UButton
            v-if="canDiscard"
            color="neutral"
            variant="outline"
            icon="i-lucide-rotate-ccw"
            :loading="discarding"
            @click="discardDraft"
          >
            <span class="hidden sm:inline">Discard draft</span>
          </UButton>
          <UButton
            icon="i-lucide-save"
            :loading="savingDraft"
            :disabled="!canSaveDraft"
            aria-label="Save Draft"
            @click="saveDraft"
          >
            <span class="hidden sm:inline">Save Draft</span>
          </UButton>
          <UButton
            v-if="canUnpublish"
            color="warning"
            variant="outline"
            icon="i-lucide-eye-off"
            :loading="unpublishing"
            @click="unpublish"
          >
            <span class="hidden sm:inline">Unpublish</span>
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
          <UButton
            color="error"
            icon="i-lucide-trash"
            :loading="removing"
            variant="outline"
            aria-label="Delete"
            @click="remove"
          >
            <span class="hidden sm:inline">Delete</span>
          </UButton>
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
