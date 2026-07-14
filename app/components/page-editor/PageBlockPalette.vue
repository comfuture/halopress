<script setup lang="ts">
import type { CommandPaletteGroup, CommandPaletteItem } from '@nuxt/ui'

import { pageBlockRegistry } from '~/editor/page/registry'
import type { PageBlockComponentKey } from '~/editor/page/types'

const props = withDefaults(defineProps<{
  editable?: boolean
}>(), {
  editable: true
})

const emit = defineEmits<{
  insert: [key: PageBlockComponentKey]
  dragstart: [event: DragEvent, key: PageBlockComponentKey]
}>()

const paletteGroups = computed<CommandPaletteGroup<CommandPaletteItem>[]>(() => {
  const categories = [...new Set(pageBlockRegistry.components.map(item => item.category))]
  return categories.map(category => ({
    id: category.toLowerCase(),
    label: category,
    items: pageBlockRegistry.components
      .filter(item => item.category === category)
      .map(item => ({
        value: item.key,
        label: item.label,
        description: item.summary,
        summary: item.summary,
        category: item.category,
        keywords: item.keywords,
        icon: item.icon,
        disabled: !props.editable,
        onSelect: () => emit('insert', item.key)
      } as CommandPaletteItem))
  }))
})

function blockKey(value: unknown) {
  return value as PageBlockComponentKey
}

const fuse = {
  fuseOptions: {
    ignoreLocation: true,
    threshold: 0.2,
    keys: ['label', 'summary', 'category', 'keywords']
  },
  resultLimit: 24,
  matchAllWhenSearchEmpty: true
}
</script>

<template>
  <section aria-labelledby="page-editor-block-library" class="flex h-full min-h-0 flex-col">
    <div class="border-b border-muted px-4 py-3">
      <h2 id="page-editor-block-library" class="text-sm font-semibold text-highlighted">
        Block library
      </h2>
      <p class="mt-1 text-xs text-muted">
        Search, tap, press Enter, or drag. Tap inserts after the active selection, or at the end.
      </p>
    </div>

    <UCommandPalette
      :groups="paletteGroups"
      :fuse="fuse"
      :autofocus="false"
      placeholder="Search blocks..."
      class="min-h-0 flex-1"
      :ui="{
        content: 'min-h-0',
        viewport: 'p-2',
        group: 'space-y-1',
        item: 'p-0'
      }"
    >
      <template #item="{ item }">
        <div
          class="flex w-full items-start gap-3 rounded-md p-2"
          :draggable="editable"
          :data-page-block-key="item.value"
          @dragstart="emit('dragstart', $event, blockKey(item.value))"
        >
          <UIcon :name="item.icon" class="mt-0.5 size-5 shrink-0 text-primary" />
          <span class="min-w-0 text-left">
            <span class="block text-sm font-medium text-highlighted">{{ item.label }}</span>
            <span class="mt-0.5 block text-xs text-muted">{{ item.description }}</span>
          </span>
        </div>
      </template>
    </UCommandPalette>
  </section>
</template>
