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

const toast = useToast()

const breadcrumbItems = computed<BreadcrumbItem[]>(() => ([
  { label: 'Pages', icon: 'i-lucide-panels-top-left', to: '/_desk/pages' },
  { label: 'New' }
]))

const emptyDoc: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] }

const state = reactive({
  title: '',
  content: emptyDoc as JSONContent
})

function buildSnapshot() {
  return {
    title: state.title || '',
    content: state.content
  }
}

const savingDraft = ref(false)
const publishing = ref(false)
const lastSavedJson = ref(stableStringify(buildSnapshot()))
const currentJson = computed(() => stableStringify(buildSnapshot()))
const isDirty = computed(() => currentJson.value !== lastSavedJson.value)
const canSaveDraft = computed(() => isDirty.value && !savingDraft.value)
const canPublish = computed(() => isDirty.value && !publishing.value)

async function saveDraft() {
  if (!isDirty.value) return
  savingDraft.value = true
  try {
    const res = await $fetch<{ id: string }>('/api/page', {
      method: 'POST',
      body: { title: state.title, status: 'draft', content: state.content }
    })
    toast.add({ title: 'Created', description: res.id })
    await navigateTo(`/_desk/pages/${res.id}`)
  } catch (e: any) {
    toast.add({ title: 'Create failed', description: e?.statusMessage || 'Error', color: 'error' })
  } finally {
    savingDraft.value = false
  }
}

async function publish() {
  if (!isDirty.value) return
  publishing.value = true
  try {
    const res = await $fetch<{ id: string }>('/api/page', {
      method: 'POST',
      body: { title: state.title, status: 'published', content: state.content }
    })
    toast.add({ title: 'Published', description: res.id })
    await navigateTo(`/_desk/pages/${res.id}`)
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
  <UDashboardPanel id="desk-pages-new">
    <template #header>
      <DeskNavbar title="New Page">
        <template #title>
          <div class="flex min-w-0 flex-col">
            <UBreadcrumb :items="breadcrumbItems" />
            <span class="truncate text-xs text-muted">Build the page, then save a draft or publish.</span>
          </div>
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
