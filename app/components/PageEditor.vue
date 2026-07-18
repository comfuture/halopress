<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { mapEditorItems } from '@nuxt/ui/utils/editor'
import type { Editor, JSONContent } from '@tiptap/vue-3'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import { markRaw } from 'vue'
import { clonePagePatternContent, pagePatternRegistry, type PagePatternKey } from '~~/shared/page-patterns'

import PageEditorPanel from '~/components/page-editor/PageEditorPanel.vue'
import RichEditorLinkPopover from '~/components/cms/RichEditorLinkPopover.vue'
import PageBlock from '~/editor/page/PageBlock'
import PageBlockNodeView from '~/editor/page/PageBlockNodeView.vue'
import { clonePageBlockAttrs } from '~/editor/page/inspector-state'
import type { PagePaletteItem } from '~/editor/page/palette'
import { getPageBlockComponent, pageBlockRegistry } from '~/editor/page/registry'
import { clearPageBlockSelection } from '~/editor/page/selection'
import type { PageBlockAttrs, PageBlockComponentKey } from '~/editor/page/types'
import { createPageProfile } from '~/editor/profiles'
import type { EditorProfileCustomization } from '~/editor/profiles'
import ImageUpload from '~/editor/RichEditorImageUpload'
import RichEditorImageUploadNode from '~/editor/RichEditorImageUploadNode.vue'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  editable?: boolean
  profile?: EditorProfileCustomization
  pageDescription?: string
  pageValidationMessage?: string
}>(), {
  editable: true,
  profile: () => ({})
})

const value = defineModel<JSONContent | null>({ default: null })
const pageTitle = defineModel<string>('pageTitle', { default: '' })
const publicPath = defineModel<string>('publicPath', { default: '' })
const seoTitle = defineModel<string>('seoTitle', { default: '' })
const seoDescription = defineModel<string>('seoDescription', { default: '' })
const seoImageAssetId = defineModel<string>('seoImageAssetId', { default: '' })
const structuredDataType = defineModel<string>('structuredDataType', { default: '' })

const PageBlockEditor = PageBlock.extend({
  addNodeView() {
    return VueNodeViewRenderer(PageBlockNodeView)
  }
})
const ImageUploadEditor = ImageUpload.extend({
  addNodeView() {
    return VueNodeViewRenderer(RichEditorImageUploadNode)
  }
})
const editorProfile = createPageProfile(props.profile, {
  pageBlockFactory: () => PageBlockEditor.configure({}),
  imageUploadFactory: () => ImageUploadEditor.configure({})
})
const extensions = markRaw(editorProfile.extensions.map(extension => markRaw(extension)))

const editorRef = ref<any>(null)
const canvasRef = ref<HTMLElement | null>(null)
const selectedBlock = ref<PageBlockAttrs | null>(null)
const selectedDragNode = ref<{ node: JSONContent | null, pos: number } | null>(null)
const mode = ref<'edit' | 'preview'>('edit')
const viewport = ref<'desktop' | 'tablet' | 'mobile'>('desktop')
const activePanel = ref<'library' | 'inspector'>('inspector')
const panelCollapsed = ref(false)
const mobilePanelOpen = ref(false)
const dropPosition = ref<number | null>(null)
const dropIndicatorTop = ref<number | null>(null)

const isEditMode = computed(() => mode.value === 'edit')
const isEditing = computed(() => props.editable && isEditMode.value)
const activeComponent = computed(() => getPageBlockComponent(selectedBlock.value?.component))
const activeFields = computed(() => activeComponent.value?.fields ?? [])

const viewportItems = [
  { label: 'Desktop', value: 'desktop', icon: 'i-lucide-monitor' },
  { label: 'Tablet', value: 'tablet', icon: 'i-lucide-tablet' },
  { label: 'Mobile', value: 'mobile', icon: 'i-lucide-smartphone' }
]
const canvasStyle = computed(() => ({
  width: '100%',
  maxWidth: viewport.value === 'desktop' ? '80rem' : viewport.value === 'tablet' ? '48rem' : '24rem'
}))
const workspaceColumns = computed(() => {
  if (!isEditMode.value) return 'xl:grid-cols-1'
  return panelCollapsed.value
    ? 'xl:grid-cols-[minmax(0,1fr)_3rem]'
    : 'xl:grid-cols-[minmax(0,1fr)_22rem]'
})

function getEditor() {
  return (editorRef.value?.editor ?? null) as Editor | null
}

function syncSelection(editor: Editor) {
  const selection: any = editor.state.selection
  const node = selection.node
  selectedBlock.value = node?.type?.name === 'pageBlock'
    ? clonePageBlockAttrs(node.attrs as PageBlockAttrs)
    : null
  if (selectedBlock.value) activePanel.value = 'inspector'
}

watch(getEditor, (editor, _previous, onCleanup) => {
  if (!editor) return
  const handler = () => syncSelection(editor)
  editor.on('selectionUpdate', handler)
  editor.on('update', handler)
  handler()
  onCleanup(() => {
    editor.off('selectionUpdate', handler)
    editor.off('update', handler)
  })
}, { immediate: true })

function blockAttrs(key: PageBlockComponentKey): PageBlockAttrs & { component: PageBlockComponentKey } {
  const entry = pageBlockRegistry.byKey[key]
  return {
    component: entry.key,
    props: structuredClone(entry.defaultProps),
    advanced: {},
    media: structuredClone(entry.defaultMedia)
  }
}

function selectionInsertionPosition(editor: Editor) {
  const selection: any = editor.state.selection
  if (selection.node?.type.name === 'pageBlock') {
    return selection.from + selection.node.nodeSize
  }
  if (selection.$from.depth > 0) return selection.$from.after(1)
  return editor.state.doc.content.size
}

function insertBlock(key: PageBlockComponentKey, position?: number) {
  const editor = getEditor()
  if (!editor || !isEditing.value || !pageBlockRegistry.byKey[key]) return false
  const destination = position ?? selectionInsertionPosition(editor)
  const inserted = editor.commands.insertPageBlockAt(destination, blockAttrs(key))
  if (inserted) mobilePanelOpen.value = false
  return inserted
}

function insertPattern(key: PagePatternKey, position?: number) {
  const editor = getEditor()
  if (!editor || !isEditing.value || !pagePatternRegistry.byKey[key]) return false
  const destination = position ?? selectionInsertionPosition(editor)
  const inserted = editor.commands.insertPagePatternAt(destination, clonePagePatternContent(key))
  if (inserted) mobilePanelOpen.value = false
  return inserted
}

function insertPaletteItem(item: PagePaletteItem, position?: number) {
  return item.kind === 'block'
    ? insertBlock(item.key, position)
    : insertPattern(item.key, position)
}

function updateSelectedBlock(attrs: PageBlockAttrs) {
  const editor = getEditor()
  if (!editor || !isEditing.value) return
  editor.commands.updatePageBlockAttributes(attrs)
}

function showPageProperties() {
  const editor = getEditor()
  if (editor) {
    clearPageBlockSelection(editor)
  }
  selectedBlock.value = null
  activePanel.value = 'inspector'
}

function openMobilePanel(tab: 'library' | 'inspector') {
  if (!isEditMode.value) return
  activePanel.value = tab
  mobilePanelOpen.value = true
}

const getDragHandleItems = (editor: Editor): DropdownMenuItem[][] => {
  const selected = selectedDragNode.value
  if (!selected?.node?.type) return []
  const groups = editorProfile.quickMenuGroups.flatMap(create => create({
    editor,
    node: selected.node!,
    pos: selected.pos
  }))
  return mapEditorItems(editor, groups as any, editorProfile.handlers) as DropdownMenuItem[][]
}

function onDragNodeChange(event: { node: JSONContent | null, pos: number }) {
  selectedDragNode.value = event
}

function selectDragNode(editor: Editor) {
  const selected = selectedDragNode.value
  if (selected?.node && Number.isInteger(selected.pos)) editor.commands.setNodeSelection(selected.pos)
}

function setDragMenuOpen(editor: Editor, open: boolean) {
  if (open) selectDragNode(editor)
  editor.chain().setMeta('lockDragHandle', open).run()
}

function startPaletteDrag(event: DragEvent, item: PagePaletteItem) {
  if (!isEditing.value || !event.dataTransfer) return
  event.dataTransfer.effectAllowed = 'copy'
  const payload = JSON.stringify(item)
  event.dataTransfer.setData('application/x-halopress-page-library', payload)
  event.dataTransfer.setData('text/plain', `${item.kind}:${item.key}`)
}

function dropTargetAt(editor: Editor, clientX: number, clientY: number) {
  const coordinates = editor.view.posAtCoords({ left: clientX, top: clientY })
  if (!coordinates) return null
  const children: Array<{ position: number; end: number; element: HTMLElement }> = []
  editor.state.doc.forEach((node, position) => {
    const dom = editor.view.nodeDOM(position)
    if (dom instanceof HTMLElement) children.push({ position, end: position + node.nodeSize, element: dom })
  })
  if (!children.length) return { position: 0, top: 0 }
  const canvasRect = canvasRef.value?.getBoundingClientRect()
  for (const child of children) {
    const rect = child.element.getBoundingClientRect()
    if (clientY <= rect.top + rect.height / 2) {
      return { position: child.position, top: canvasRect ? rect.top - canvasRect.top : 0 }
    }
  }
  const last = children.at(-1)!
  const rect = last.element.getBoundingClientRect()
  return { position: last.end, top: canvasRect ? rect.bottom - canvasRect.top : rect.bottom }
}

function handleCanvasDragOver(event: DragEvent) {
  if (!isEditing.value || !event.dataTransfer?.types.includes('application/x-halopress-page-library')) return
  const editor = getEditor()
  if (!editor) return
  const target = dropTargetAt(editor, event.clientX, event.clientY)
  if (!target) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'copy'
  dropPosition.value = target.position
  dropIndicatorTop.value = target.top
}

function clearDropTarget() {
  dropPosition.value = null
  dropIndicatorTop.value = null
}

function handleCanvasDrop(event: DragEvent) {
  event.preventDefault()
  const position = dropPosition.value
  let item: PagePaletteItem | null = null
  try {
    const parsed = JSON.parse(event.dataTransfer?.getData('application/x-halopress-page-library') || '')
    if (parsed?.kind === 'block' && pageBlockRegistry.byKey[parsed.key as PageBlockComponentKey]) {
      item = { kind: 'block', key: parsed.key as PageBlockComponentKey }
    } else if (parsed?.kind === 'pattern' && pagePatternRegistry.byKey[parsed.key as PagePatternKey]) {
      item = { kind: 'pattern', key: parsed.key as PagePatternKey }
    }
  } catch {
    item = null
  }
  if (!item || position === null) {
    clearDropTarget()
    return
  }
  insertPaletteItem(item, position)
  clearDropTarget()
}

defineShortcuts({
  meta_shift_p: () => { mode.value = mode.value === 'edit' ? 'preview' : 'edit' },
  meta_shift_b: () => openMobilePanel('library'),
  meta_shift_i: () => openMobilePanel('inspector')
})

watch(mode, (nextMode) => {
  if (nextMode === 'preview') mobilePanelOpen.value = false
})
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-muted/30" data-page-editor-workspace>
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-muted bg-default px-3 py-2">
      <div class="flex items-center gap-1">
        <UButton
          v-if="isEditMode"
          class="xl:hidden"
          label="Editor panel"
          icon="i-lucide-panel-right"
          color="neutral"
          variant="ghost"
          size="sm"
          @click="mobilePanelOpen = true;"
        />
        <UButton
          :label="mode === 'edit' ? 'Preview' : 'Edit'"
          :icon="mode === 'edit' ? 'i-lucide-eye' : 'i-lucide-pencil'"
          color="neutral"
          variant="ghost"
          size="sm"
          :disabled="!editable"
          @click="mode = mode === 'edit' ? 'preview' : 'edit';"
        />
      </div>
      <div class="inline-flex items-center gap-1" role="group" aria-label="Canvas viewport">
        <UButton
          v-for="item in viewportItems"
          :key="item.value"
          :label="item.label"
          :icon="item.icon"
          color="neutral"
          :variant="viewport === item.value ? 'soft' : 'ghost'"
          @click="viewport = item.value as typeof viewport;"
        />
      </div>
    </div>

    <div class="grid min-h-0 flex-1 grid-cols-1" :class="workspaceColumns">
      <main class="min-h-0 min-w-0 overflow-auto p-3 sm:p-5" aria-label="Page canvas">
        <div
          ref="canvasRef"
          class="relative mx-auto min-h-full transition-[max-width] duration-200"
          :style="canvasStyle"
          data-page-editor-canvas
          @dragover="handleCanvasDragOver"
          @dragleave.self="clearDropTarget"
          @drop="handleCanvasDrop"
        >
          <div v-if="dropIndicatorTop !== null" class="pointer-events-none absolute inset-x-0 z-20 h-0.5 bg-primary" :style="{ top: `${dropIndicatorTop}px` }" data-page-block-drop-indicator />
          <div v-show="mode === 'edit'" :aria-hidden="mode === 'preview'">
            <UEditor
              ref="editorRef"
              v-slot="{ editor }"
              v-model="value"
              content-type="json"
              :extensions="extensions"
              :handlers="editorProfile.handlers"
              :editable="isEditing"
              class="min-h-full w-full rounded-md border border-muted bg-default shadow-sm"
              :ui="{ base: 'min-h-[calc(100dvh-12rem)] px-4 py-4 sm:px-6' }"
            >
              <UEditorToolbar
                v-if="isEditing"
                :editor="editor"
                :items="editorProfile.toolbarGroups"
                class="sticky top-0 z-10 flex-wrap border-b border-muted bg-default/95 backdrop-blur"
              >
                <template #link>
                  <RichEditorLinkPopover :editor="editor" auto-open />
                </template>
              </UEditorToolbar>

              <UEditorDragHandle
                v-if="isEditing"
                v-slot="{ ui }"
                :editor="editor"
                :plugin-key="editorProfile.pluginKeys.dragHandle"
                class="inline-flex"
                @node-change="onDragNodeChange"
              >
                <UDropdownMenu
                  v-slot="{ open }"
                  :modal="false"
                  :items="getDragHandleItems(editor)"
                  :content="{ side: 'left' }"
                  :ui="{ content: 'w-48', label: 'text-xs' }"
                  @update:open="setDragMenuOpen(editor, $event)"
                >
                  <UButton
                    color="neutral"
                    variant="ghost"
                    active-variant="soft"
                    size="sm"
                    icon="i-lucide-grip-vertical"
                    :active="open"
                    :class="ui.handle()"
                    aria-label="Block actions"
                  />
                </UDropdownMenu>
              </UEditorDragHandle>
            </UEditor>
          </div>
          <PageDocumentRenderer
            v-show="mode === 'preview'"
            :document="value"
            class="min-h-[calc(100dvh-12rem)] rounded-md border border-muted bg-default px-4 py-4 shadow-sm sm:px-6"
          />
        </div>
      </main>

      <aside v-if="isEditMode" class="hidden min-h-0 border-l border-muted bg-default xl:flex xl:flex-col" aria-label="Page editor panel">
        <template v-if="panelCollapsed">
          <UButton aria-label="Expand page editor panel" icon="i-lucide-panel-right-open" color="neutral" variant="ghost" class="m-2" @click="panelCollapsed = false;" />
        </template>
        <template v-else>
          <PageEditorPanel
            v-model:active-tab="activePanel"
            v-model:page-title="pageTitle"
            v-model:public-path="publicPath"
            v-model:seo-title="seoTitle"
            v-model:seo-description="seoDescription"
            v-model:seo-image-asset-id="seoImageAssetId"
            v-model:structured-data-type="structuredDataType"
            :selected-block="selectedBlock"
            :active-fields="activeFields"
            :active-label="activeComponent?.label"
            :editable="isEditing"
            :page-description="pageDescription"
            :page-validation-message="pageValidationMessage"
            collapsible
            @collapse="panelCollapsed = true"
            @insert="insertPaletteItem"
            @dragstart="startPaletteDrag"
            @update-block="updateSelectedBlock"
            @show-page-properties="showPageProperties"
          />
        </template>
      </aside>
    </div>

    <USlideover v-if="isEditMode" v-model:open="mobilePanelOpen" title="Page editor" side="right" :ui="{ body: 'p-0 sm:p-0 min-h-0' }">
      <template #body>
        <PageEditorPanel
          v-model:active-tab="activePanel"
          v-model:page-title="pageTitle"
          v-model:public-path="publicPath"
          v-model:seo-title="seoTitle"
          v-model:seo-description="seoDescription"
          v-model:seo-image-asset-id="seoImageAssetId"
          v-model:structured-data-type="structuredDataType"
          :selected-block="selectedBlock"
          :active-fields="activeFields"
          :active-label="activeComponent?.label"
          :editable="isEditing"
          :page-description="pageDescription"
          :page-validation-message="pageValidationMessage"
          @insert="insertPaletteItem"
          @dragstart="startPaletteDrag"
          @update-block="updateSelectedBlock"
          @show-page-properties="showPageProperties"
        />
      </template>
    </USlideover>
  </div>
</template>
