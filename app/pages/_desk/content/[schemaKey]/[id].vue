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
  { label: doc.value?.title || doc.value?.id || id.value }
]))

const state = reactive({
  title: '',
  extra: {} as Record<string, any>
})

const contentFormRef = ref<any>(null)

function buildContentSnapshot() {
  return {
    title: state.title || '',
    extra: state.extra
  }
}

function buildContentSnapshotFromDoc(source: any) {
  return {
    title: source?.title || '',
    extra: source?.extra || {}
  }
}

const savingDraft = ref(false)
const publishing = ref(false)

const lastSavedContentJson = ref('')
const currentContentJson = computed(() => stableStringify(buildContentSnapshot()))
const isDirty = computed(() => !!doc.value && currentContentJson.value !== lastSavedContentJson.value)
const canSaveDraft = computed(() => !!doc.value && isDirty.value && !savingDraft.value)
const canPublish = computed(() => !!doc.value && (isDirty.value || doc.value?.status === 'draft') && !publishing.value)

watch(
  () => doc.value,
  (next) => {
    if (!next) return
    state.title = next.title || ''
    state.extra = { ...(next.extra || {}) }
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
      body: { title: state.title, status: 'draft', extra: state.extra }
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
  if (!isDirty.value && doc.value?.status !== 'draft') return
  if (!(await contentFormRef.value?.validate?.())) {
    toast.add({ title: 'Fix validation errors', color: 'error' })
    return
  }
  publishing.value = true
  try {
    await $fetch(`/api/content/${schemaKey.value}/${id.value}`, {
      method: 'PUT',
      body: { title: state.title, status: 'published', extra: state.extra }
    })
    toast.add({ title: 'Published' })
    await navigateTo(`/_desk/content/${schemaKey.value}`)
  } catch (e: any) {
    toast.add({ title: 'Publish failed', description: e?.statusMessage || 'Error', color: 'error' })
  } finally {
    publishing.value = false
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
        :title="doc?.title || doc?.id || id"
      >
        <template #title>
          <div class="flex flex-col min-w-0">
            <UBreadcrumb :items="breadcrumbItems" />
            <span class="text-xs text-muted truncate">{{ `${schema?.title || schemaKey} • ${doc?.status || 'draft'}` }}</span>
          </div>
        </template>

        <template #actions>
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
      <UCard v-if="schema?.registry" class="shrink-0">
        <div class="flex flex-col gap-4">
          <UFormField label="Title" class="w-full">
            <UInput v-model="state.title" placeholder="Optional title" class="w-full" />
          </UFormField>

          <CmsContentForm ref="contentFormRef" :schema="schema" :model="state.extra" />
        </div>
      </UCard>
    </template>
  </UDashboardPanel>
</template>
