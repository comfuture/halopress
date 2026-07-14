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
    expect(editor).toContain('invisible absolute inset-0')
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
    expect(palette).toContain('onSelect: () => emit(\'insert\', item.key)')
    expect(palette).toContain('@dragstart="emit(\'dragstart\'')
    expect(editor).toContain('application/x-halopress-page-block')
    expect(editor).toContain('editor.view.posAtCoords')
    expect(editor).toContain('editor.commands.insertPageBlockAt')
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
    expect(inspector).toContain('Portable JSON only')
  })
})
