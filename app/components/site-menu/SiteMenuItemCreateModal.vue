<script setup lang="ts">
import type { FormErrorEvent, FormSubmitEvent } from '@nuxt/ui'
import { ulid } from 'ulid'

import {
  siteMenuLeafSchema,
  type SiteMenuLeaf
} from '~~/shared/site-menu'

const props = withDefaults(defineProps<{
  kind: 'parent' | 'child'
  resourceId: string
  parentLabel?: string
}>(), {
  parentLabel: undefined
})
const emit = defineEmits<{
  create: [item: SiteMenuLeaf, resourceId: string]
}>()

const open = ref(false)
const deliveryPending = ref(false)
const pendingCreation = ref<{
  item: SiteMenuLeaf
  resourceId: string
  generation: number
} | null>(null)
const formId = `site-menu-item-create-${useId()}`
const draft = ref<SiteMenuLeaf>(newDraft())
let active = true
let lifecycleGeneration = 0

const title = computed(() => props.kind === 'parent' ? 'Add menu item' : 'Add child item')
const description = computed(() => props.kind === 'parent'
  ? 'Enter the link information. You can continue editing it in the item inspector.'
  : `Enter the child link information${props.parentLabel ? ` for ${props.parentLabel}` : ''}.`)

function newDraft(): SiteMenuLeaf {
  return {
    id: `menu-${ulid()}`,
    label: '',
    destination: { type: 'home' }
  }
}

onBeforeUnmount(() => {
  active = false
  lifecycleGeneration++
})

function handleOpenChange(nextOpen: boolean) {
  if (!shouldAcceptSiteMenuItemCreateOpenChange(deliveryPending.value, nextOpen)) return
  open.value = nextOpen
  if (!nextOpen) return
  draft.value = newDraft()
  pendingCreation.value = null
}

function submit(event: FormSubmitEvent<SiteMenuLeaf>) {
  if (deliveryPending.value || pendingCreation.value) return
  const generation = ++lifecycleGeneration
  pendingCreation.value = {
    item: siteMenuLeafSchema.parse(event.data),
    resourceId: props.resourceId,
    generation
  }
  deliveryPending.value = true
  open.value = false
}

async function focusInvalidField(_event: FormErrorEvent) {
  await nextTick()
  document.querySelector<HTMLElement>('[data-menu-item-create-label]')?.focus()
}

function cancel() {
  handleOpenChange(false)
}

function afterLeave() {
  const created = pendingCreation.value
  pendingCreation.value = null
  if (created) {
    // Let Reka finish restoring the trigger before the new inspector or mobile
    // Slideover takes focus, otherwise close-autofocus can steal it back.
    afterSiteMenuOverlayFocusRestored(() => {
      if (!shouldEmitDeferredSiteMenuCreation(
        active,
        created.generation,
        lifecycleGeneration
      )) return
      deliveryPending.value = false
      emit('create', created.item, created.resourceId)
    })
  }
}
</script>

<template>
  <UModal
    :open="open"
    :title="title"
    :description="description"
    :ui="{ content: 'max-w-2xl', footer: 'justify-end' }"
    @update:open="handleOpenChange"
    @after:leave="afterLeave"
  >
    <slot />

    <template #body>
      <UForm
        :id="formId"
        :schema="siteMenuLeafSchema"
        :state="draft"
        :loading-auto="false"
        @submit="submit"
        @error="focusInvalidField"
      >
        <SiteMenuItemEditor
          v-model="draft"
          path-prefix="create"
          autofocus-label
        />
      </UForm>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          type="button"
          color="neutral"
          variant="outline"
          @click="cancel"
        >
          Cancel
        </UButton>
        <UButton
          type="submit"
          :form="formId"
          icon="i-lucide-plus"
        >
          {{ kind === 'parent' ? 'Add item' : 'Add child' }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
