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
    expect(editorSlot).toContain('<UEditorToolbar')
    expect(editorSlot).toContain('<UEditorDragHandle')
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
    expect(editor).toContain('<USlideover v-model:open="mobilePaletteOpen"')
    expect(editor).toContain('<USlideover v-model:open="mobileInspectorOpen"')
    expect(editor).toContain('class="hidden sm:inline-flex"')
    expect(editor).not.toContain('UDashboardGroup')
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
  })

  it('keeps block actions live-selection based and inspector updates focus safe', async () => {
    const editor = await source('app/components/PageEditor.vue')
    const inspector = await source('app/components/page-editor/PageBlockInspector.vue')

    expect(editor).toContain('editor.commands[command]()')
    expect(editor).toContain('editor.commands.updatePageBlockAttributes(attrs)')
    expect(editor).not.toContain('selectedBlock.value.pos')
    expect(editor).not.toContain('.focus()')
    expect(inspector).toContain('<CmsAssetPicker v-model="selectedAssetId"')
    expect(inspector).toContain('Move link up')
    expect(inspector).toContain('field.type === \'object-list\'')
    expect(inspector).toContain('Portable JSON only')
  })

  it('offers explicit blank and reviewed starter choices only on new pages', async () => {
    const createPage = await source('app/pages/_desk/pages/new.vue')
    const editPage = await source('app/pages/_desk/pages/[id].vue')

    expect(createPage).toContain('data-page-starter-choices')
    expect(createPage).toContain('chooseStarter(\'blank\')')
    expect(createPage).toContain('chooseStarter(\'starter\')')
    expect(createPage).toContain('buildPageDocumentFromPattern(\'starter-page\')')
    expect(editPage).not.toContain('data-page-starter-choices')
  })
})
