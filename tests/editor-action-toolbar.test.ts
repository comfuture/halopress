import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const files = {
  actions: new URL('../app/components/cms/EditorActions.vue', import.meta.url),
  contentEdit: new URL('../app/pages/_desk/content/[schemaKey]/[id].vue', import.meta.url),
  contentNew: new URL('../app/pages/_desk/content/[schemaKey]/new.vue', import.meta.url),
  pageEdit: new URL('../app/pages/_desk/pages/[id].vue', import.meta.url),
  pageNew: new URL('../app/pages/_desk/pages/new.vue', import.meta.url)
}

describe('editor action toolbar', () => {
  it('keeps the visible action hierarchy focused on preview, save, and publish', async () => {
    const source = await readFile(files.actions, 'utf8')

    expect(source).toContain('icon="i-lucide-eye"')
    expect(source).toContain('@click="openPreview"')
    expect(source).toContain('aria-label="Save Draft"')
    expect(source).toContain('label="Publish"')
    expect(source).toContain('icon="i-lucide-ellipsis-vertical"')
    expect(source).toContain('aria-label="More actions"')
    expect(source).not.toContain('color="warning"')
    expect(source).not.toContain('color="error"')
  })

  it('keeps draft preview in a fullscreen modal instead of leaving the editor', async () => {
    const source = await readFile(files.actions, 'utf8')

    expect(source).toContain('v-model:open="previewOpen"')
    expect(source).toContain('<UModal')
    expect(source).toContain('fullscreen')
    expect(source).toContain('<iframe')
    expect(source).toContain(':src="previewTo"')
    expect(source).not.toContain('target="_blank"')
  })

  it('moves secondary and destructive edit actions into menu item models', async () => {
    const [contentEdit, pageEdit] = await Promise.all([
      readFile(files.contentEdit, 'utf8'),
      readFile(files.pageEdit, 'utf8')
    ])

    for (const source of [contentEdit, pageEdit]) {
      expect(source).toContain('const actionMenuItems = computed<DropdownMenuItem[][]>')
      expect(source).toContain(`label: 'Discard draft'`)
      expect(source).toContain(`label: 'Unpublish'`)
      expect(source).toContain(`label: 'Delete'`)
      expect(source).toContain(`color: 'error'`)
      expect(source).toContain('<CmsEditorActions')
      expect(source).not.toContain('<UButton')
    }

    expect(contentEdit).toContain(`title: 'Delete content'`)
    expect(pageEdit).toContain(`title: 'Delete page'`)
    expect(pageEdit).toContain(`label: 'View published'`)
  })

  it('removes JSON download actions from both page editors', async () => {
    const [pageEdit, pageNew] = await Promise.all([
      readFile(files.pageEdit, 'utf8'),
      readFile(files.pageNew, 'utf8')
    ])

    for (const source of [pageEdit, pageNew]) {
      expect(source).not.toContain('downloadJson')
      expect(source).not.toContain('Download JSON')
      expect(source).not.toContain('i-lucide-download')
    }
  })

  it('uses the shared action presentation across all content and page editors', async () => {
    const sources = await Promise.all([
      readFile(files.contentEdit, 'utf8'),
      readFile(files.contentNew, 'utf8'),
      readFile(files.pageEdit, 'utf8'),
      readFile(files.pageNew, 'utf8')
    ])

    for (const source of sources) {
      expect(source).toContain('<CmsEditorActions')
      expect(source).toContain('@save-draft="saveDraft"')
      expect(source).toContain('@publish="publish"')
    }
  })
})
