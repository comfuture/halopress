<script setup lang="ts">
import type { BreadcrumbItem, DropdownMenuItem } from '@nuxt/ui'
import type { JSONContent } from '@tiptap/vue-3'
import { PUBLIC_PAGE_ROUTE_PREFIX } from '~~/shared/public-routing'
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
const { confirm } = useConfirmDialog()
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
const canPublish = computed(() => !!doc.value && (
  isDirty.value || ['never-published', 'unpublished', 'published-with-draft'].includes(doc.value?.publicationState)
) && !publishing.value)
const canDiscard = computed(() => !!doc.value?.hasPublishedRevision && doc.value?.hasDraftChanges)
const canUnpublish = computed(() => !!doc.value?.hasPublishedRevision)

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
  if (!canPublish.value) return
  publishing.value = true
  try {
    await $fetch(`/api/page/${id.value}/publish`, {
      method: 'POST',
      body: { title: state.title, content: state.content }
    })
    toast.add({ title: 'Published' })
    await refresh()
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
    await $fetch(`/api/page/${id.value}/discard`, { method: 'POST' })
    toast.add({ title: 'Draft discarded' })
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Discard failed', description: e?.statusMessage || 'Error', color: 'error' })
  } finally {
    discarding.value = false
  }
}

const unpublishing = ref(false)
async function unpublish() {
  const ok = await confirm({
    title: 'Unpublish page',
    body: 'Anonymous delivery will stop, while the working draft is retained.',
    confirmLabel: 'Unpublish',
    confirmColor: 'warning'
  })
  if (!ok) return
  unpublishing.value = true
  try {
    await $fetch(`/api/page/${id.value}/unpublish`, { method: 'POST' })
    toast.add({ title: 'Unpublished' })
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Unpublish failed', description: e?.statusMessage || 'Error', color: 'error' })
  } finally {
    unpublishing.value = false
  }
}

const removing = ref(false)
async function remove() {
  const ok = await confirm({
    title: 'Delete page',
    body: 'This will soft delete the page and it will no longer appear in the list.',
    confirmLabel: 'Delete',
    confirmColor: 'error'
  })
  if (!ok) return
  removing.value = true
  try {
    await $fetch(`/api/page/${id.value}`, { method: 'DELETE' })
    toast.add({ title: 'Deleted (soft)' })
    await navigateTo('/_desk/pages')
  } catch (e: any) {
    toast.add({ title: 'Delete failed', description: e?.statusMessage || 'Error', color: 'error' })
  } finally {
    removing.value = false
  }
}

const actionMenuItems = computed<DropdownMenuItem[][]>(() => {
  const groups: DropdownMenuItem[][] = []

  if (canUnpublish.value) {
    groups.push([{
      label: 'View published',
      icon: 'i-lucide-external-link',
      to: `/${PUBLIC_PAGE_ROUTE_PREFIX}/${id.value}`,
      target: '_blank'
    }])
  }

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
  <UDashboardPanel id="desk-pages-edit">
    <template #header>
      <DeskNavbar :title="doc?.title || 'Page'">
        <template #title>
          <div class="flex min-w-0 flex-col">
            <UBreadcrumb :items="breadcrumbItems" />
            <span class="truncate text-xs text-muted">Update the page, then save a draft or publish.</span>
          </div>
        </template>

        <template #actions>
          <CmsEditorActions
            :preview-to="`/_preview/pages/${id}`"
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
      <div class="space-y-4">
        <UFormField label="Title">
          <UInput v-model="state.title" placeholder="Page title" class="w-full" />
        </UFormField>

        <PageEditor v-model="state.content" />
      </div>
    </template>
  </UDashboardPanel>
</template>
