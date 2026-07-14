import { readBody } from 'h3'

import { normalizePageContent } from '../../cms/page-content'
import { syncDocumentAssetRefs } from '../../cms/asset-refs'
import { getDb } from '../../db/db'
import { page as pageTable } from '../../db/schema'
import { executeDbStatement, withDbTransaction } from '../../db/transaction'
import { createInitialDocumentRevision } from '../../cms/document-revisions'
import { assertDraftWriteStatus } from '../../cms/publication-transitions'
import { requireAdmin } from '../../utils/auth'
import { newId } from '../../utils/ids'
import { getTrustedRequestOrigin } from '../../utils/request-origin'

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event)
  const body = await readBody<{ title?: string, status?: string, content?: unknown }>(event)
  assertDraftWriteStatus(body?.status)
  const id = newId()
  const title = body?.title?.trim() || null
  const content = normalizePageContent(body?.content)
  const now = new Date()
  const status = 'draft'
  const actorId = (session.user as any)?.id ?? null
  const db = await getDb(event)

  await withDbTransaction(event, db, async (tx: any, statements) => {
    await executeDbStatement(tx.insert(pageTable).values({
      id,
      title,
      status,
      contentJson: JSON.stringify(content),
      currentRevision: 1,
      createdBy: actorId,
      updatedBy: actorId,
      createdAt: now,
      updatedAt: now
    }), statements)
    await createInitialDocumentRevision({
      tx,
      statements,
      documentKind: 'page',
      documentId: id,
      state: { snapshot: content, status, title },
      actorId,
      createdAt: now
    })
    await syncDocumentAssetRefs({
      db: tx,
      documentKind: 'page',
      documentId: id,
      projectionScope: 'working',
      content,
      trustedOrigin: getTrustedRequestOrigin(event),
      statements
    })
  })

  return {
    ok: true,
    id,
    revision: 1,
    publicationState: 'never-published',
    hasPublishedRevision: false,
    hasDraftChanges: false,
    publishedAt: null
  }
})
