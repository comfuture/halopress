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
const schemaKey = computed(() => String(route.params.schemaKey))

const { data: schema } = await useFetch<any>(() => `/api/schema/${schemaKey.value}/active`)

const breadcrumbItems = computed<BreadcrumbItem[]>(() => ([
  { label: schema.value?.title || schemaKey.value, icon: 'i-lucide-files', to: `/_desk/content/${schemaKey.value}` },
  { label: 'New' }
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

watchEffect(() => {
  if (!schema.value?.registry) return
  const next: Record<string, any> = {}
  for (const f of schema.value.registry.fields) {
    next[f.key] = state.extra[f.key] ?? (f.kind === 'richtext' ? { type: 'doc', content: [{ type: 'paragraph' }] } : null)
  }
  state.extra = next
})

const savingDraft = ref(false)
const publishing = ref(false)

const lastSavedContentJson = ref('')
const baselineReady = ref(false)
const currentContentJson = computed(() => stableStringify(buildContentSnapshot()))
const expectedFieldCount = computed(() => schema.value?.registry?.fields?.length ?? 0)
const baselineReadyByFields = computed(() => !!schema.value?.registry && Object.keys(state.extra).length === expectedFieldCount.value)

watchEffect(() => {
  if (baselineReady.value) return
  if (!baselineReadyByFields.value) return
  lastSavedContentJson.value = currentContentJson.value
  baselineReady.value = true
})

const isDirty = computed(() => baselineReady.value && currentContentJson.value !== lastSavedContentJson.value)
const canSaveDraft = computed(() => isDirty.value && !savingDraft.value)
const canPublish = computed(() => isDirty.value && !publishing.value)

async function saveDraft() {
  if (!isDirty.value) return
  if (!(await contentFormRef.value?.validate?.())) {
    toast.add({ title: 'Fix validation errors', color: 'error' })
    return
  }
  savingDraft.value = true
  try {
    const res = await $fetch<{ id: string }>(`/api/content/${schemaKey.value}`, {
      method: 'POST',
      body: { title: state.title, status: 'draft', extra: state.extra }
    })
    toast.add({ title: 'Created', description: res.id })
    await navigateTo(`/_desk/content/${schemaKey.value}/${res.id}`)
  } catch (e: any) {
    toast.add({ title: 'Create failed', description: e?.statusMessage || 'Error', color: 'error' })
  } finally {
    savingDraft.value = false
  }
}

async function publish() {
  if (!isDirty.value) return
  if (!(await contentFormRef.value?.validate?.())) {
    toast.add({ title: 'Fix validation errors', color: 'error' })
    return
  }
  publishing.value = true
  try {
    await $fetch<{ id: string }>(`/api/content/${schemaKey.value}`, {
      method: 'POST',
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
</script>

<template>
  <UDashboardPanel id="desk-content-new">
    <template #header>
      <DeskNavbar
        :title="`New ${schema?.title || schemaKey}`"
      >
        <template #title>
          <UBreadcrumb :items="breadcrumbItems" />
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
