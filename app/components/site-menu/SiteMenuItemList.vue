<script setup lang="ts">
import type { MoveEvent, SortableEvent } from 'sortablejs'
import { moveArrayElement, useSortable } from '@vueuse/integrations/useSortable'
import { ulid } from 'ulid'

import type { SiteMenuItem, SiteMenuValidationIssue } from '~~/shared/site-menu'

const model = defineModel<SiteMenuItem[]>({ required: true })
const emit = defineEmits<{ announce: [message: string] }>()
const props = defineProps<{ validationIssues?: SiteMenuValidationIssue[] }>()

const listRef = ref<HTMLOListElement | null>(null)
const dropTarget = ref<{ id: string; after: boolean } | null>(null)
const draggedLabel = ref('Menu item')

function labelAt(index: number) {
  return model.value[index]?.label || `Link ${index + 1}`
}

function immutableIdError(index: number) {
  return validationMessageForPath(props.validationIssues ?? [], `document.items.${index}.id`)
}

function moveWithControls(index: number, direction: -1 | 1) {
  const next = index + direction
  if (next < 0 || next >= model.value.length) return
  const item = model.value[index]
  if (!item) return
  model.value = moveSiteMenuArrayItem(model.value, index, next)
  emit('announce', siteMenuMoveAnnouncement(item.label, next + 1, model.value.length, 'parent'))
  nextTick(() => focusSiteMenuMoveControl(item.id, direction === -1 ? 'up' : 'down'))
}

function removeItem(index: number) {
  const [removed] = model.value.splice(index, 1)
  if (removed) emit('announce', `Removed ${removed.label}.`)
}

function addChild(item: SiteMenuItem) {
  if (item.children.length >= 8) return
  item.children.push({
    id: `menu-${ulid()}`,
    label: 'Child link',
    destination: { type: 'home' }
  })
  emit('announce', `Added child link ${item.children.length} to ${item.label}.`)
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
  handle: '.hp-menu-drag-handle',
  draggable: '.hp-menu-sort-item',
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
    nextTick(() => emit('announce', siteMenuMoveAnnouncement(label, event.newIndex! + 1, model.value.length, 'parent')))
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
  <ol ref="listRef" class="space-y-4" aria-label="Menu items">
    <li
      v-for="(item, index) in model"
      :key="item.id"
      :data-item-id="item.id"
      :data-item-label="item.label"
      class="hp-menu-sort-item"
    >
      <div
        v-if="dropTarget?.id === item.id && !dropTarget.after"
        class="mb-2 h-0.5 rounded-full bg-primary"
        data-drop-indicator="before"
      />
      <fieldset
        class="space-y-4 rounded-lg border border-default p-4"
        :data-validation-path="`document.items.${index}.id`"
        :aria-invalid="Boolean(immutableIdError(index))"
        tabindex="-1"
      >
        <legend class="sr-only">
          Link {{ index + 1 }}
        </legend>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <UButton
              type="button"
              icon="i-lucide-grip-vertical"
              color="neutral"
              variant="ghost"
              square
              class="hp-menu-drag-handle min-h-11 min-w-11 touch-none cursor-grab active:cursor-grabbing"
              :aria-label="`Drag ${item.label || `link ${index + 1}`}`"
            />
            <span class="text-sm font-medium text-highlighted">{{ item.label || `Link ${index + 1}` }}</span>
            <span class="text-xs text-muted">Position {{ index + 1 }} of {{ model.length }}</span>
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
              :aria-label="`Move ${item.label || `link ${index + 1}`} up`"
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
              :aria-label="`Move ${item.label || `link ${index + 1}`} down`"
              @click="moveWithControls(index, 1)"
            />
            <UButton
              type="button"
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              square
              class="min-h-11 min-w-11"
              :aria-label="`Remove ${item.label || `link ${index + 1}`}`"
              @click="removeItem(index)"
            />
          </div>
        </div>

        <UAlert
          v-if="immutableIdError(index)"
          title="This item's immutable ID conflicts with another item"
          :description="immutableIdError(index)"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
        />

        <SiteMenuItemEditor
          v-model="model[index]!"
          :path-prefix="`document.items.${index}`"
          :validation-issues="validationIssues"
        />

        <UAlert
          v-if="item.children.length"
          title="Parent links act as submenu triggers"
          description="The saved parent destination becomes active again if all children are removed."
          icon="i-lucide-info"
          variant="subtle"
        />

        <div v-if="item.children.length" class="space-y-3 border-s border-muted ps-4">
          <SiteMenuChildList
            v-model="item.children"
            :path-prefix="`document.items.${index}.children`"
            :validation-issues="validationIssues"
            @announce="emit('announce', $event)"
          />
        </div>

        <UButton
          type="button"
          color="neutral"
          variant="link"
          icon="i-lucide-corner-down-right"
          :disabled="item.children.length >= 8"
          @click="addChild(item)"
        >
          Add child link
        </UButton>
      </fieldset>
      <div
        v-if="dropTarget?.id === item.id && dropTarget.after"
        class="mt-2 h-0.5 rounded-full bg-primary"
        data-drop-indicator="after"
      />
    </li>
  </ol>
</template>
