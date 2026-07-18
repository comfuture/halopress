<script setup lang="ts">
import type { MoveEvent, SortableEvent } from 'sortablejs'
import { moveArrayElement, useSortable } from '@vueuse/integrations/useSortable'

import type { SiteMenuLeaf, SiteMenuValidationIssue } from '~~/shared/site-menu'

const model = defineModel<SiteMenuLeaf[]>({ required: true })
const emit = defineEmits<{ announce: [message: string] }>()
const props = defineProps<{
  pathPrefix: string
  validationIssues?: SiteMenuValidationIssue[]
}>()

const listRef = ref<HTMLOListElement | null>(null)
const dropTarget = ref<{ id: string; after: boolean } | null>(null)
const draggedLabel = ref('Menu item')

function labelAt(index: number) {
  return model.value[index]?.label || `Child link ${index + 1}`
}

function immutableIdError(index: number) {
  return validationMessageForPath(props.validationIssues ?? [], `${props.pathPrefix}.${index}.id`)
}

function moveWithControls(index: number, direction: -1 | 1) {
  const next = index + direction
  if (next < 0 || next >= model.value.length) return
  const item = model.value[index]
  if (!item) return
  model.value = moveSiteMenuArrayItem(model.value, index, next)
  emit('announce', siteMenuMoveAnnouncement(item.label, next + 1, model.value.length, 'child'))
  nextTick(() => focusSiteMenuMoveControl(item.id, direction === -1 ? 'up' : 'down'))
}

function removeItem(index: number) {
  const [removed] = model.value.splice(index, 1)
  if (removed) emit('announce', `Removed ${removed.label}.`)
}

function onMove(event: MoveEvent) {
  const related = event.related as HTMLElement
  const id = related.dataset.itemId
  if (!id) return true
  dropTarget.value = { id, after: Boolean(event.willInsertAfter) }
  const targetLabel = related.dataset.itemLabel || 'item'
  emit('announce', `Move ${draggedLabel.value} ${event.willInsertAfter ? 'after' : 'before'} ${targetLabel}.`)
  return true
}

const sortable = useSortable(listRef, model, {
  watchElement: true,
  handle: '.hp-menu-child-drag-handle',
  draggable: '.hp-menu-child-sort-item',
  animation: 150,
  forceFallback: true,
  fallbackOnBody: true,
  fallbackTolerance: 3,
  ghostClass: 'opacity-35',
  chosenClass: 'ring-2',
  dragClass: 'shadow-lg',
  delayOnTouchOnly: true,
  delay: 150,
  touchStartThreshold: 3,
  onStart: (event: SortableEvent) => {
    draggedLabel.value = labelAt(event.oldIndex ?? 0)
  },
  onMove,
  onUpdate: (event: SortableEvent) => {
    if (event.oldIndex == null || event.newIndex == null) return
    const label = labelAt(event.oldIndex)
    moveArrayElement(model, event.oldIndex, event.newIndex, event)
    nextTick(() => emit('announce', siteMenuMoveAnnouncement(label, event.newIndex! + 1, model.value.length, 'child')))
  },
  onEnd: () => {
    dropTarget.value = null
  }
})

onMounted(() => {
  nextTick(() => sortable.start())
})
</script>

<template>
  <ol ref="listRef" class="space-y-3" aria-label="Child menu items">
    <li
      v-for="(item, index) in model"
      :key="item.id"
      :data-item-id="item.id"
      :data-item-label="item.label"
      class="hp-menu-child-sort-item"
    >
      <div
        v-if="dropTarget?.id === item.id && !dropTarget.after"
        class="mb-2 h-0.5 rounded-full bg-primary"
        data-drop-indicator="before"
      />
      <fieldset
        class="rounded-md border border-muted bg-elevated/40 p-4"
        :data-validation-path="`${props.pathPrefix}.${index}.id`"
        :aria-invalid="Boolean(immutableIdError(index))"
        tabindex="-1"
      >
        <legend class="sr-only">
          Child link {{ index + 1 }}
        </legend>
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <UButton
              type="button"
              icon="i-lucide-grip-vertical"
              color="neutral"
              variant="ghost"
              square
              class="hp-menu-child-drag-handle min-h-11 min-w-11 touch-none cursor-grab active:cursor-grabbing"
              :aria-label="`Drag ${item.label || `child link ${index + 1}`}`"
            />
            <span class="text-xs text-muted">Child {{ index + 1 }} of {{ model.length }}</span>
          </div>
          <div class="flex items-center gap-1">
            <UButton
              type="button"
              icon="i-lucide-arrow-up"
              color="neutral"
              variant="ghost"
              square
              class="min-h-11 min-w-11"
              :data-menu-item-id="item.id"
              data-menu-move="up"
              :disabled="index === 0"
              :aria-label="`Move ${item.label || `child link ${index + 1}`} up`"
              @click="moveWithControls(index, -1)"
            />
            <UButton
              type="button"
              icon="i-lucide-arrow-down"
              color="neutral"
              variant="ghost"
              square
              class="min-h-11 min-w-11"
              :data-menu-item-id="item.id"
              data-menu-move="down"
              :disabled="index === model.length - 1"
              :aria-label="`Move ${item.label || `child link ${index + 1}`} down`"
              @click="moveWithControls(index, 1)"
            />
            <UButton
              type="button"
              icon="i-lucide-x"
              color="error"
              variant="ghost"
              square
              class="min-h-11 min-w-11"
              :aria-label="`Remove ${item.label || `child link ${index + 1}`}`"
              @click="removeItem(index)"
            />
          </div>
        </div>
        <UAlert
          v-if="immutableIdError(index)"
          title="This child's immutable ID conflicts with another item"
          :description="immutableIdError(index)"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          class="mb-3"
        />
        <SiteMenuItemEditor
          v-model="model[index]!"
          :path-prefix="`${props.pathPrefix}.${index}`"
          :validation-issues="validationIssues"
        />
      </fieldset>
      <div
        v-if="dropTarget?.id === item.id && dropTarget.after"
        class="mt-2 h-0.5 rounded-full bg-primary"
        data-drop-indicator="after"
      />
    </li>
  </ol>
</template>
