import { readBody } from 'h3'

import { normalizePageContent } from '../../cms/page-content'
import { syncDocumentAssetRefs } from '../../cms/asset-refs'
import { publicationMetadata, publicationRevisionValues } from '../../cms/publication'
import { getDb } from '../../db/db'
import { page as pageTable, publicationRevision } from '../../db/schema'
import { executeDbStatement, withDbTransaction } from '../../db/transaction'
import { requireAdmin } from '../../utils/auth'
import { newId } from '../../utils/ids'
import { getTrustedRequestOrigin } from '../../utils/request-origin'

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event)
  const body = await readBody<{ title?: string, status?: string, content?: unknown }>(event)
  const id = newId()
  const revisionId = body?.status === 'published' ? newId() : null
  const title = body?.title?.trim() || null
  const content = normalizePageContent(body?.content)
  const now = new Date()
  const status = revisionId ? 'published' : 'draft'
  const actorId = (session.user as any)?.id ?? null
  const db = await getDb(event)

  await withDbTransaction(event, db, async (tx: any, statements) => {
    await executeDbStatement(tx.insert(pageTable).values({
      id,
      title,
      status,
      contentJson: JSON.stringify(content),
      publishedRevisionId: revisionId,
      firstPublishedAt: revisionId ? now : null,
      publishedAt: revisionId ? now : null,
      createdBy: actorId,
      createdAt: now,
      updatedAt: now
    }), statements)
    if (revisionId) {
      await executeDbStatement(tx.insert(publicationRevision).values(publicationRevisionValues({
        id: revisionId,
        documentKind: 'page',
        documentId: id,
        title,
        content,
        createdBy: actorId,
        createdAt: now
      })), statements)
    }
    const scopes = revisionId ? ['working', 'published'] as const : ['working'] as const
    for (const projectionScope of scopes) {
      await syncDocumentAssetRefs({
        db: tx,
        documentKind: 'page',
        documentId: id,
        projectionScope,
        content,
        trustedOrigin: getTrustedRequestOrigin(event),
        statements
      })
    }
  })

  return {
    ok: true,
    id,
    ...publicationMetadata({
      status,
      publishedRevisionId: revisionId,
      firstPublishedAt: revisionId ? now : null,
      publishedAt: revisionId ? now : null
    })
  }
})
