import { readBody } from 'h3'
import { and, eq } from 'drizzle-orm'

import { getDb } from '../../../db/db'
import { requireAdmin } from '../../../utils/auth'
import { badRequest, notFound } from '../../../utils/http'
import { content as contentTable } from '../../../db/schema'
import { getActiveSchema } from '../../../cms/repo'
import { syncContentRefs } from '../../../cms/ref-sync'
import { upsertContentSearchData } from '../../../cms/search-index'
import { upsertContentItemSnapshot } from '../../../cms/content-items'
import { replaceBase64ImagesInExtra } from '../../../utils/asset-data-url'
import { queueWidgetCacheInvalidation } from '../../../utils/widget-cache'

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event)
  const actorId = (session.user as any)?.id ?? null
  const schemaKey = event.context.params?.schemaKey as string
  const id = event.context.params?.id as string
  const body = await readBody<{ title?: string; status?: string; extra?: Record<string, unknown> }>(event)

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
  const title = body?.title?.trim() ?? existing.title
  const status = body?.status ?? existing.status
  const extra = body?.extra ?? JSON.parse(existing.extraJson)
  if (typeof extra !== 'object' || Array.isArray(extra) || !extra) throw badRequest('Invalid extra')

  await db.transaction(async (tx: any) => {
    await replaceBase64ImagesInExtra({ event, db: tx, createdBy: actorId, extra })

    await tx
      .update(contentTable)
      .set({
        title,
        status,
        extraJson: JSON.stringify(extra),
        schemaVersion: active.version,
        updatedAt: now
      })
      .where(eq(contentTable.id, id))

    await syncContentRefs({ db: tx, contentId: id, registry, extra })
    await upsertContentSearchData({ db: tx, contentId: id, registry, extra })
    await upsertContentItemSnapshot({
      db: tx,
      registry,
      extra,
      contentId: id,
      schemaKey,
      schemaVersion: active.version,
      title,
      status,
      createdAt: existing.createdAt,
      updatedAt: now
    })
  })

  queueWidgetCacheInvalidation(event, `schema:${schemaKey}`)

  return { ok: true }
})
