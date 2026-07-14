import { and, eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'

import {
  diffDocumentSnapshots,
  listDocumentRevisions,
  mutateWithDocumentRevision
} from '../server/cms/document-revisions'
import { assertDraftWriteStatus, assertEditorialTransition } from '../server/cms/publication-transitions'
import { content, documentAssetRef, documentRevision } from '../server/db/schema'
import { executeDbStatement } from '../server/db/transaction'
import { runMigrations } from '../server/utils/install'
import { hasSchemaPermission } from '../server/utils/schema-permission'
import { createTestSqliteDb } from './fixtures/sqlite'

vi.mock('#auth', () => ({ getToken: vi.fn() }))

const event = { context: {} } as any

describe('editorial revision safety', () => {
  it('produces stable nested diffs', () => {
    expect(diffDocumentSnapshots(
      { title: 'Before', tags: ['one'], nested: { keep: true } },
      { title: 'After', tags: ['one', 'two'], nested: { keep: true } }
    )).toEqual([
      { path: '$.tags[1]', before: undefined, after: 'two' },
      { path: '$.title', before: 'Before', after: 'After' }
    ])
  })

  it('treats array and object shape changes as a direct replacement', () => {
    expect(diffDocumentSnapshots(['one'], { 0: 'one' })).toEqual([{
      path: '$',
      before: ['one'],
      after: { 0: 'one' }
    }])
  })

  it('rejects arbitrary status writes and invalid recovery transitions', () => {
    expect(() => assertDraftWriteStatus('published')).toThrowError('Use an explicit publication transition endpoint')
    expect(() => assertEditorialTransition('draft', 'recover')).toThrowError('Cannot recover a draft document')
    expect(assertEditorialTransition('deleted', 'recover')).toBe('deleted')
  })

  it('keeps edit, publication, archival, and destructive capabilities independent', () => {
    const base = {
      roleKey: 'writer',
      canRead: false,
      canWrite: true,
      canPublish: false,
      canArchive: false,
      canDelete: false,
      canAdmin: false
    }
    expect(hasSchemaPermission(base, 'read')).toBe(true)
    expect(hasSchemaPermission(base, 'write')).toBe(true)
    expect(hasSchemaPermission(base, 'publish')).toBe(false)
    expect(hasSchemaPermission({ ...base, canPublish: true }, 'publish')).toBe(true)
    expect(hasSchemaPermission({ ...base, canArchive: true }, 'archive')).toBe(true)
    expect(hasSchemaPermission({ ...base, canDelete: true }, 'delete')).toBe(true)
  })

  it('turns a racing stale save into 409 and rolls back projection writes', async () => {
    const fixture = await createTestSqliteDb()
    const { db } = fixture
    try {
      await runMigrations(db)
      const createdAt = new Date('2026-07-14T00:00:00.000Z')
      await db.insert(content).values({
        id: 'article-1',
        schemaKey: 'article',
        schemaVersion: 1,
        status: 'draft',
        contentJson: JSON.stringify({ title: 'Initial' }),
        currentRevision: 1,
        createdAt,
        updatedAt: createdAt
      })
      await db.insert(documentRevision).values({
        id: 'revision-1',
        documentKind: 'content',
        documentId: 'article-1',
        schemaKey: 'article',
        revision: 1,
        action: 'create',
        status: 'draft',
        schemaVersion: 1,
        snapshotJson: JSON.stringify({ title: 'Initial' }),
        createdAt
      })

      const staleIdentity = { currentRevision: 1, updatedAt: createdAt, updatedBy: null }
      await mutateWithDocumentRevision({
        event,
        db,
        identity: staleIdentity,
        expectedRevision: 1,
        documentKind: 'content',
        documentId: 'article-1',
        schemaKey: 'article',
        action: 'save',
        state: { snapshot: { title: 'Winner' }, status: 'draft', schemaVersion: 1 },
        actorId: 'writer-1',
        work: async (tx, statements, nextRevision, now) => {
          await executeDbStatement(tx.update(content).set({
            contentJson: JSON.stringify({ title: 'Winner' }),
            currentRevision: nextRevision,
            updatedBy: 'writer-1',
            updatedAt: now
          }).where(and(eq(content.id, 'article-1'), eq(content.currentRevision, 1))), statements)
        }
      })

      await expect(mutateWithDocumentRevision({
        event,
        db,
        identity: staleIdentity,
        expectedRevision: 1,
        documentKind: 'content',
        documentId: 'article-1',
        schemaKey: 'article',
        action: 'save',
        state: { snapshot: { title: 'Loser' }, status: 'draft', schemaVersion: 1 },
        actorId: 'writer-2',
        work: async (tx, statements, nextRevision, now) => {
          await executeDbStatement(tx.update(content).set({
            contentJson: JSON.stringify({ title: 'Loser' }),
            currentRevision: nextRevision,
            updatedBy: 'writer-2',
            updatedAt: now
          }).where(and(eq(content.id, 'article-1'), eq(content.currentRevision, 1))), statements)
          await executeDbStatement(tx.insert(documentAssetRef).values({
            documentKind: 'content',
            documentId: 'article-1',
            projectionScope: 'working',
            assetId: 'loser-asset'
          }), statements)
        }
      })).rejects.toMatchObject({
        statusCode: 409,
        data: expect.objectContaining({ currentRevision: 2 })
      })

      expect(await db.select().from(documentAssetRef).where(eq(documentAssetRef.documentId, 'article-1'))).toEqual([])
      const stored = await db.select().from(content).where(eq(content.id, 'article-1')).get()
      expect(JSON.parse(stored!.contentJson)).toEqual({ title: 'Winner' })
      expect(stored!.currentRevision).toBe(2)
      const history = await listDocumentRevisions(db, 'content', 'article-1')
      expect(history.items.map(item => [item.revision, item.action])).toEqual([[2, 'save'], [1, 'create']])
    } finally {
      fixture.close()
    }
  })
})
