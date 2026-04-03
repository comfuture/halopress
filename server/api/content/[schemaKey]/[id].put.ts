import { readBody } from 'h3'
import { and, eq } from 'drizzle-orm'

import { getDb } from '../../../db/db'
import { getAuthSession } from '../../../utils/auth'
import { getContentTitle, parseContentJson } from '../../../cms/content-json'
import { badRequest, notFound } from '../../../utils/http'
import { content as contentTable } from '../../../db/schema'
import { getActiveSchema } from '../../../cms/repo'
import { syncContentRefs } from '../../../cms/ref-sync'
import { upsertContentSearchData } from '../../../cms/search-index'
import { upsertContentItemSnapshot } from '../../../cms/content-items'
import { replaceBase64ImagesInContent } from '../../../utils/asset-data-url'
import { queueWidgetCacheInvalidation } from '../../../utils/widget-cache'
import { requireSchemaPermission } from '../../../utils/schema-permission'

export default defineEventHandler(async (event) => {
  const schemaKey = event.context.params?.schemaKey as string
  const id = event.context.params?.id as string
  await requireSchemaPermission(event, schemaKey, 'write')
  const session = await getAuthSession(event)
  const actorId = (session?.user as any)?.id ?? null
  const body = await readBody<{ status?: string; content?: Record<string, unknown> }>(event)

  const db = await getDb(event)
  const active = await getActiveSchema(db, schemaKey)
  if (!active?.registry) throw notFound('Active schema not found')
  const registry = active.registry

  const existing = await db
    .select()
    .from(contentTable)
    .where(and(eq(contentTable.schemaKey, schemaKey), eq(contentTable.id, id)))
    .get()
  if (!existing) throw notFound('Content not found')

  const now = new Date()
  const status = body?.status ?? existing.status
  const content = body?.content ?? parseContentJson(existing.contentJson)
  if (typeof content !== 'object' || Array.isArray(content) || !content) throw badRequest('Invalid content')

  await db.transaction(async (tx: any) => {
    await replaceBase64ImagesInContent({ event, db: tx, createdBy: actorId, content })

    await tx
      .update(contentTable)
      .set({
        status,
        contentJson: JSON.stringify(content),
        schemaVersion: active.version,
        updatedAt: now
      })
      .where(eq(contentTable.id, id))

    await syncContentRefs({ db: tx, contentId: id, registry, content })
    await upsertContentSearchData({
      db: tx,
      contentId: id,
      registry,
      content,
      systemContent: {
        title: getContentTitle(content),
        createdAt: existing.createdAt,
        updatedAt: now
      }
    })
    await upsertContentItemSnapshot({
      db: tx,
      registry,
      content,
      contentId: id,
      schemaKey,
      schemaVersion: active.version,
      status,
      createdAt: existing.createdAt,
      updatedAt: now
    })
  })

  queueWidgetCacheInvalidation(event, `schema:${schemaKey}`)

  return { ok: true }
})
