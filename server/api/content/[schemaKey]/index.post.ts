import { readBody } from 'h3'

import { syncContentProjections } from '../../../cms/content-projections'
import { validateContentJson } from '../../../cms/content-validation'
import { publicationMetadata, publicationRevisionValues } from '../../../cms/publication'
import { getActiveSchema } from '../../../cms/repo'
import { getDb } from '../../../db/db'
import { content as contentTable, publicationRevision } from '../../../db/schema'
import { executeDbStatement, withDbTransaction } from '../../../db/transaction'
import { getAuthSession } from '../../../utils/auth'
import { replaceBase64ImagesInContent } from '../../../utils/asset-data-url'
import { badRequest, notFound } from '../../../utils/http'
import { newId } from '../../../utils/ids'
import { requireSchemaPermission } from '../../../utils/schema-permission'
import { queueWidgetCacheInvalidation } from '../../../utils/widget-cache'

export default defineEventHandler(async (event) => {
  const schemaKey = event.context.params?.schemaKey as string
  await requireSchemaPermission(event, schemaKey, 'write')
  const session = await getAuthSession(event)
  const actorId = (session?.user as any)?.id ?? null
  const body = await readBody<{ status?: string, content?: Record<string, unknown> }>(event)
  const db = await getDb(event)
  const active = await getActiveSchema(db, schemaKey)
  if (!active?.registry) throw notFound('Active schema not found')

  const input = body?.content ?? {}
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw badRequest('Invalid content')
  const content = validateContentJson(active.jsonSchema, input)
  const id = newId()
  const revisionId = body?.status === 'published' ? newId() : null
  const now = new Date()
  const status = revisionId ? 'published' : 'draft'

  await withDbTransaction(event, db, async (tx: any, statements) => {
    await replaceBase64ImagesInContent({ event, db: tx, createdBy: actorId, content, statements })
    await executeDbStatement(tx.insert(contentTable).values({
      id,
      schemaKey,
      schemaVersion: active.version,
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
        documentKind: 'content',
        documentId: id,
        schemaKey,
        schemaVersion: active.version,
        content,
        createdBy: actorId,
        createdAt: now
      })), statements)
    }
    const scopes = revisionId ? ['working', 'published'] as const : ['working'] as const
    for (const projectionScope of scopes) {
      await syncContentProjections({
        db: tx,
        registry: active.registry!,
        content,
        contentId: id,
        schemaKey,
        schemaVersion: active.version,
        status,
        createdAt: now,
        updatedAt: now,
        projectionScope,
        statements
      })
    }
  })

  if (revisionId) queueWidgetCacheInvalidation(event, 'schema:' + schemaKey)
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
