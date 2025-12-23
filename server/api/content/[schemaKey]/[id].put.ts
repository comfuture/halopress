import { readBody } from 'h3'
import { and, eq } from 'drizzle-orm'

import { getDb } from '../../../db/db'
import { requireAdmin } from '../../../utils/auth'
import { badRequest, notFound } from '../../../utils/http'
import { content as contentTable } from '../../../db/schema'
import { getActiveSchema } from '../../../cms/repo'
import { syncContentRefs } from '../../../cms/ref-sync'
import { replaceBase64ImagesInExtra } from '../../../utils/asset-data-url'

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event)
  const schemaKey = event.context.params?.schemaKey as string
  const id = event.context.params?.id as string
  const body = await readBody<{ title?: string; status?: string; extra?: Record<string, unknown> }>(event)

  const db = await getDb(event)
  const active = await getActiveSchema(db, schemaKey)
  if (!active?.registry) throw notFound('Active schema not found')

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

  await replaceBase64ImagesInExtra({ event, db, createdBy: session.sub, extra })

  await db
    .update(contentTable)
    .set({
      title,
      status,
      extraJson: JSON.stringify(extra),
      schemaVersion: active.version,
      updatedAt: now
    })
    .where(eq(contentTable.id, id))

  await syncContentRefs({ db, contentId: id, registry: active.registry, extra })

  return { ok: true }
})
