import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = join(import.meta.dirname, '..')

async function source(path: string) {
  return await readFile(join(projectRoot, path), 'utf8')
}

describe('Desk editorial safety UI', () => {
  it('uses a shared Nuxt UI history drawer with immutable restore semantics', async () => {
    const history = await source('app/components/cms/RevisionHistorySlideover.vue')

    expect(history).toContain('<USlideover')
    expect(history).toContain('<UTimeline')
    expect(history).toContain('Restore creates a new immutable revision.')
    expect(history).toContain('body: { revision: props.currentRevision }')
    expect(history).toContain(`emit('conflict', error)`)
  })

  it('preserves local editor state when a stale content, page, or schema mutation conflicts', async () => {
    const editors = await Promise.all([
      source('app/pages/_desk/content/[schemaKey]/[id].vue'),
      source('app/pages/_desk/pages/[id].vue'),
      source('app/pages/_desk/schemas/[schemaKey]/index.vue')
    ])

    for (const editor of editors) {
      expect(editor).toContain('currentRevision')
      expect(editor).toContain('conflictDetails')
      expect(editor).toContain('A newer')
      expect(editor).toContain('Review history')
      expect(editor).toContain('Reload latest')
      expect(editor).toContain('body: { revision')
    }
  })

  it('creates drafts before invoking explicit publish commands', async () => {
    const contentNew = await source('app/pages/_desk/content/[schemaKey]/new.vue')
    const pageNew = await source('app/pages/_desk/pages/new.vue')

    for (const editor of [contentNew, pageNew]) {
      expect(editor).not.toContain(`status: 'published'`)
      expect(editor).toContain(`body: { revision: created.revision`)
      expect(editor).toContain('/publish`')
    }
  })

  it('gates content actions by separate permissions and exposes deleted recovery', async () => {
    const contentEdit = await source('app/pages/_desk/content/[schemaKey]/[id].vue')
    const settings = await source('app/pages/_desk/schemas/[schemaKey]/settings.vue')
    const pageList = await source('app/pages/_desk/pages/index.vue')

    for (const key of ['canWrite', 'canPublish', 'canArchive', 'canDelete']) {
      expect(contentEdit).toContain(key)
      expect(settings).toContain(key)
    }
    expect(contentEdit).toContain('/recover`')
    expect(contentEdit).toContain(':disabled="isDeleted || !canWrite"')
    expect(settings).toContain('overflow-x-auto')
    expect(pageList).toContain(`{ label: 'Deleted', value: 'deleted' }`)
  })
})
