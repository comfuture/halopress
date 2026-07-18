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
  pageDescription?: string
  pageValidationMessage?: string
}>(), {
  activeLabel: undefined,
  editable: true,
  pageDescription: undefined,
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
const seoTitle = defineModel<string>('seoTitle', { default: '' })
const seoDescription = defineModel<string>('seoDescription', { default: '' })
const seoImageAssetId = defineModel<string>('seoImageAssetId', { default: '' })
const structuredDataType = defineModel<string>('structuredDataType', { default: '' })

const panelTabs: TabsItem[] = [
  { label: 'Block Library', value: 'library', slot: 'library' },
  { label: 'Inspector', value: 'inspector', slot: 'inspector' }
]

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
      list: 'shrink-0 rounded-none border-b border-muted',
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
          v-model:seo-title="seoTitle"
          v-model:seo-description="seoDescription"
          v-model:seo-image-asset-id="seoImageAssetId"
          v-model:structured-data-type="structuredDataType"
          class="min-h-0 flex-1"
          :disabled="!props.editable"
          :description="pageDescription"
          :validation-message="pageValidationMessage"
        />
      </div>
    </template>
  </UTabs>
</template>
