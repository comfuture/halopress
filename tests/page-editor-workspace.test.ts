import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = resolve(import.meta.dirname, '..')

async function source(path: string) {
  return await readFile(resolve(projectRoot, path), 'utf8')
}

describe('page editor workspace contracts', () => {
  it('composes Nuxt UI editor controls through the mounted editor slot', async () => {
    const editor = await source('app/components/PageEditor.vue')
    const editorStart = editor.indexOf('<UEditor\n')
    const editorEnd = editor.indexOf('</UEditor>', editorStart)
    const editorSlot = editor.slice(editorStart, editorEnd)

    expect(editorSlot).toContain('v-slot="{ editor }"')
    expect(editorSlot).toContain(':items="editorProfile.toolbarGroups"')
    expect(editorSlot).toContain('<RichEditorLinkPopover :editor="editor" auto-open')
    expect(editorSlot).toContain('<UEditorDragHandle')
    expect(editorSlot).toContain('<UDropdownMenu')
    expect(editorSlot).toContain('@update:open="setDragMenuOpen(editor, $event)"')
    expect(editor).toContain('editorProfile.quickMenuGroups.flatMap')
    expect(editor).toContain('editor.commands.setNodeSelection(selected.pos)')
    expect(editor).toContain('if (result) syncSelection(editor)')
    expect(editor).toContain('setMeta(\'lockDragHandle\', open)')
    expect(editor).toContain('mapEditorItems(editor, groups as any, editorProfile.handlers)')
    expect(editor).not.toContain('label: \'Duplicate block\'')
    expect(editor).not.toContain('label: \'Move block up\'')
    expect(editor).not.toContain('label: \'Move block down\'')
    expect(editor).not.toContain('label: \'Delete block\'')
    expect(editor).toContain('<PageDocumentRenderer')
    expect(editor).toContain('<div v-show="mode === \'edit\'"')
    expect(editor).toContain('v-show="mode === \'preview\'"')
    expect(editor).not.toContain('v-if="mode === \'edit\'"')
    expect(editor).not.toContain('transform: scale')
  })

  it('uses actual viewport widths, explicit scrolling, and narrow-screen controls', async () => {
    const editor = await source('app/components/PageEditor.vue')

    expect(editor).toContain('maxWidth: viewport.value === \'desktop\' ? \'80rem\'')
    expect(editor).toContain('viewport.value === \'tablet\' ? \'48rem\' : \'24rem\'')
    expect(editor).toContain('min-h-0 min-w-0 overflow-auto')
    expect(editor.match(/<USlideover/g)).toHaveLength(1)
    expect(editor).toContain('v-model:open="mobilePanelOpen"')
    expect(editor).toContain('aria-label="Page editor panel"')
    expect(editor).not.toContain('aria-label="Block library"')
    expect(editor).not.toContain('border-r border-muted')
    expect(editor).not.toContain('UDashboardGroup')
  })

  it('keeps Block Library and Inspector in one ordered right panel', async () => {
    const editor = await source('app/components/PageEditor.vue')
    const library = editor.indexOf('{ label: \'Block Library\', value: \'library\'')
    const inspector = editor.indexOf('{ label: \'Inspector\', value: \'inspector\'')

    expect(library).toBeGreaterThan(0)
    expect(inspector).toBeGreaterThan(library)
    expect(editor).toContain('const activePanel = ref<\'library\' | \'inspector\'>(\'inspector\')')
    expect(editor).toContain('if (selectedBlock.value) activePanel.value = \'inspector\'')
    expect(editor).not.toContain(':unmount-on-hide="false"')
    expect(editor).toContain('if (!isEditMode.value) return \'xl:grid-cols-1\'')
    expect(editor).toContain('if (!isEditMode.value) return')
    expect(editor).toContain('v-if="isEditMode"')
  })

  it('provides explicit palette search keys and shared pointer, keyboard, and touch insertion', async () => {
    const palette = await source('app/components/page-editor/PageBlockPalette.vue')
    const editor = await source('app/components/PageEditor.vue')

    expect(palette).toContain('keys: [\'label\', \'summary\', \'category\', \'keywords\']')
    expect(palette).toContain('onSelect: () => emit(\'insert\', { kind: item.kind, key: item.key }')
    expect(palette).toContain('@dragstart="emit(\'dragstart\'')
    expect(palette).toContain('...pagePatternRegistry.patterns.map')
    expect(editor).toContain('application/x-halopress-page-library')
    expect(editor).toContain('editor.view.posAtCoords')
    expect(editor).toContain('editor.commands.insertPageBlockAt')
    expect(editor).toContain('editor.commands.insertPagePatternAt')
    const dropHandler = editor.indexOf('function handleCanvasDrop(event: DragEvent)')
    expect(editor.indexOf('event.preventDefault()', dropHandler))
      .toBeLessThan(editor.indexOf('const position = dropPosition.value', dropHandler))
  })

  it('keeps block actions live-selection based and inspector updates focus safe', async () => {
    const editor = await source('app/components/PageEditor.vue')
    const inspector = await source('app/components/page-editor/PageBlockInspector.vue')

    expect(editor).toContain('editor.commands.updatePageBlockAttributes(attrs)')
    expect(editor).toContain('clonePageBlockAttrs(node.attrs as PageBlockAttrs)')
    expect(editor).not.toContain('structuredClone(node.attrs as PageBlockAttrs)')
    expect(editor).toContain('clearPageBlockSelection(editor)')
    expect(editor).toContain('label="Page properties"')
    expect(editor).not.toContain('selectedBlock.value.pos')
    expect(editor).not.toContain('.focus()')
    expect(inspector).toContain('<CmsAssetPicker v-model="selectedAssetId"')
    expect(inspector).toContain('Move link up')
    expect(inspector).toContain('field.type === \'object-list\'')
    expect(inspector).toContain('[\'select\', \'color-token\', \'spacing\'].includes(itemField.type)')
    expect(inspector).toContain('Portable JSON only')
  })

  it('composes page metadata into the default Inspector without changing route-page ownership', async () => {
    const editor = await source('app/components/PageEditor.vue')
    const properties = await source('app/components/page-editor/PagePropertiesInspector.vue')
    const metadata = await source('app/components/cms/PublicMetadataFields.vue')
    const createPage = await source('app/pages/_desk/pages/new.vue')
    const editPage = await source('app/pages/_desk/pages/[id].vue')

    for (const page of [createPage, editPage]) {
      expect(page).toContain('v-model:page-title="state.title"')
      expect(page).toContain('v-model:public-path="state.publicPath"')
      expect(page).toContain('v-model:seo-title="state.seoTitle"')
      expect(page).toContain('v-model:seo-description="state.seoDescription"')
      expect(page).toContain('v-model:seo-image-asset-id="state.seoImageAssetId"')
      expect(page).toContain('v-model:structured-data-type="state.structuredDataType"')
      expect(page).not.toContain('<CmsPublicMetadataFields')
      expect(page).toContain('publicMetadataPayload()')
    }
    expect(editor).toContain('<PagePropertiesInspector')
    expect(properties).toContain('<CmsPublicMetadataFields')
    expect(properties).toContain('compact')
    expect(metadata).toContain('const schemaDefaultValue = \'__schema_default__\'')
    expect(metadata).toContain('value === schemaDefaultValue ? \'\' : value')
    expect(metadata).toContain('v-model="structuredDataTypeValue"')
    expect(metadata).not.toContain('{ label: \'Schema default\', value: \'\' }')
    expect(editPage).toContain(':editable="!isDeleted"')
    expect(editor).toContain(':disabled="!editable"')
  })

  it('offers explicit blank and reviewed starter choices only on new pages', async () => {
    const createPage = await source('app/pages/_desk/pages/new.vue')
    const editPage = await source('app/pages/_desk/pages/[id].vue')

    expect(createPage).toContain('data-page-starter-choices')
    expect(createPage).toContain('chooseStarter(\'blank\')')
    expect(createPage).toContain('chooseStarter(\'starter\')')
    expect(createPage).toContain('buildPageDocumentFromPattern(\'starter-page\')')
    expect(createPage).toMatch(/const\s+hasStarterChoice\s*=\s*computed\(\(\)\s*=>\s*starterChoice\.value\s*!==\s*null\)/)
    expect(createPage).toMatch(/hasStarterChoice\.value\s*&&\s*isDirty\.value/)
    expect(createPage).toMatch(/if\s*\(\s*!canSaveDraft\.value\s*\)\s*return/)
    expect(createPage).toMatch(/if\s*\(\s*!canPublish\.value\s*\)\s*return/)
    expect(editPage).not.toContain('data-page-starter-choices')
  })
})
