<script setup lang="ts">
import type { BreadcrumbItem } from '@nuxt/ui'
import type { JSONContent } from '@tiptap/vue-3'
import PageEditor from '~/components/PageEditor.vue'

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
const id = computed(() => String(route.params.id))

const { data: doc, refresh } = await useFetch<any>(() => `/api/page/${id.value}`)

const breadcrumbItems = computed<BreadcrumbItem[]>(() => ([
  { label: 'Pages', icon: 'i-lucide-panels-top-left', to: '/_desk/pages' },
  { label: doc.value?.title || doc.value?.id || id.value }
]))

const emptyDoc: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] }

const state = reactive({
  title: '',
  status: 'draft',
  content: emptyDoc as JSONContent
})

function buildSnapshot() {
  return {
    title: state.title || '',
    status: state.status,
    content: state.content
  }
}

const savingDraft = ref(false)
const publishing = ref(false)
const lastSavedJson = ref('')
const currentJson = computed(() => stableStringify(buildSnapshot()))
const isDirty = computed(() => !!doc.value && currentJson.value !== lastSavedJson.value)
const canSaveDraft = computed(() => !!doc.value && isDirty.value && !savingDraft.value)
const canPublish = computed(() => !!doc.value && (isDirty.value || doc.value?.status === 'draft') && !publishing.value)

watch(
  () => doc.value,
  (next) => {
    if (!next) return
    state.title = next.title || ''
    state.status = next.status || 'draft'
    state.content = next.content || emptyDoc
    lastSavedJson.value = stableStringify(buildSnapshot())
  },
  { immediate: true }
)

async function saveDraft() {
  if (!isDirty.value) return
  savingDraft.value = true
  try {
    await $fetch(`/api/page/${id.value}`, {
      method: 'PUT',
      body: { title: state.title, status: 'draft', content: state.content }
    })
    toast.add({ title: 'Saved draft' })
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Save failed', description: e?.statusMessage || 'Error', color: 'error' })
  } finally {
    savingDraft.value = false
  }
}

async function publish() {
  if (!isDirty.value && doc.value?.status !== 'draft') return
  publishing.value = true
  try {
    await $fetch(`/api/page/${id.value}`, {
      method: 'PUT',
      body: { title: state.title, status: 'published', content: state.content }
    })
    toast.add({ title: 'Published' })
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Publish failed', description: e?.statusMessage || 'Error', color: 'error' })
  } finally {
    publishing.value = false
  }
}

function downloadJson() {
  const json = JSON.stringify(state.content ?? emptyDoc, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${state.title || 'page'}.json`
  link.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <UDashboardPanel id="desk-pages-edit">
    <template #header>
      <DeskNavbar :title="doc?.title || 'Page'">
        <template #title>
          <UBreadcrumb :items="breadcrumbItems" />
        </template>

        <template #actions>
          <UButton
            icon="i-lucide-download"
            color="neutral"
            variant="ghost"
            aria-label="Download JSON"
            @click="downloadJson"
          />
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
        </template>
      </DeskNavbar>
    </template>

    <template #body>
      <div class="space-y-4">
        <UFormField label="Title">
          <UInput v-model="state.title" placeholder="Page title" class="w-full" />
        </UFormField>

        <PageEditor v-model="state.content" />
      </div>
    </template>
  </UDashboardPanel>
</template>
