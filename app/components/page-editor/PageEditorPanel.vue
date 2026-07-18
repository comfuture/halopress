<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui'

import PageBlockInspector from '~/components/page-editor/PageBlockInspector.vue'
import PageBlockPalette from '~/components/page-editor/PageBlockPalette.vue'
import PagePropertiesInspector from '~/components/page-editor/PagePropertiesInspector.vue'
import type { PagePaletteItem } from '~/editor/page/palette'
import type { PageBlockAttrs, PageBlockField } from '~/editor/page/types'

const props = withDefaults(defineProps<{
  selectedBlock: PageBlockAttrs | null
  activeFields: PageBlockField[]
  activeLabel?: string
  editable?: boolean
  pageValidationMessage?: string
}>(), {
  activeLabel: undefined,
  editable: true,
  pageValidationMessage: undefined
})

const emit = defineEmits<{
  insert: [item: PagePaletteItem]
  dragstart: [event: DragEvent, item: PagePaletteItem]
  updateBlock: [attrs: PageBlockAttrs]
  showPageProperties: []
}>()

const activeTab = defineModel<'library' | 'inspector'>('activeTab', { default: 'inspector' })
const pageTitle = defineModel<string>('pageTitle', { default: '' })
const publicPath = defineModel<string>('publicPath', { default: '' })
const description = defineModel<string>('description', { default: '' })
const socialImageAssetId = defineModel<string>('socialImageAssetId', { default: '' })
const inspectorTabLabel = computed(() => (
  activeTab.value === 'inspector' && !props.selectedBlock ? 'Page properties' : 'Inspector'
))

const panelTabs = computed<TabsItem[]>(() => [
  { label: 'Block Library', value: 'library', slot: 'library' },
  { label: inspectorTabLabel.value, value: 'inspector', slot: 'inspector' }
])

function forwardDragStart(event: DragEvent, item: PagePaletteItem) {
  emit('dragstart', event, item)
}
</script>

<template>
  <UTabs
    v-model="activeTab"
    :items="panelTabs"
    class="flex h-full min-h-0 flex-1 flex-col"
    :ui="{
      root: 'gap-0',
      list: 'min-h-12 shrink-0 rounded-none border-b border-muted',
      trigger: 'min-h-10',
      content: 'min-h-0 flex-1 overflow-hidden rounded-none p-0'
    }"
  >
    <template #library>
      <PageBlockPalette
        class="h-full min-h-0"
        :editable="editable"
        @insert="emit('insert', $event)"
        @dragstart="forwardDragStart"
      />
    </template>

    <template #inspector>
      <div class="flex h-full min-h-0 flex-col">
        <div v-if="selectedBlock" class="shrink-0 border-b border-muted px-2 py-1">
          <UButton
            label="Page properties"
            icon="i-lucide-file-cog"
            color="neutral"
            variant="link"
            size="sm"
            @click="emit('showPageProperties')"
          />
        </div>
        <div v-if="pageValidationMessage" class="shrink-0 p-4 pb-0">
          <UAlert
            title="This page is not ready to publish"
            :description="pageValidationMessage"
            icon="i-lucide-triangle-alert"
            color="error"
            variant="subtle"
          />
        </div>
        <PageBlockInspector
          v-if="selectedBlock"
          class="min-h-0 flex-1"
          :attrs="selectedBlock"
          :fields="activeFields"
          :label="activeLabel"
          :editable="editable"
          @update="emit('updateBlock', $event)"
        />
        <PagePropertiesInspector
          v-else
          v-model:page-title="pageTitle"
          v-model:public-path="publicPath"
          v-model:description="description"
          v-model:social-image-asset-id="socialImageAssetId"
          class="min-h-0 flex-1"
          :disabled="!props.editable"
        />
      </div>
    </template>
  </UTabs>
</template>
