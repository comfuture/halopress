import { readBody } from 'h3'

import { getDb } from '../../../db/db'
import { requireAdmin } from '../../../utils/auth'
import { badRequest, notFound } from '../../../utils/http'
import { newId } from '../../../utils/ids'
import { content as contentTable } from '../../../db/schema'
import { getActiveSchema } from '../../../cms/repo'
import { syncContentRefs } from '../../../cms/ref-sync'
import { replaceBase64ImagesInExtra } from '../../../utils/asset-data-url'

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event)
  const schemaKey = event.context.params?.schemaKey as string
  const body = await readBody<{ title?: string; status?: string; extra?: Record<string, unknown> }>(event)

  const db = await getDb(event)
  const active = await getActiveSchema(db, schemaKey)
  if (!active?.registry) throw notFound('Active schema not found')

  const id = newId()
  const now = new Date()
  const title = body?.title?.trim() || null
  const status = body?.status || 'draft'
  const extra = body?.extra ?? {}
  if (typeof extra !== 'object' || Array.isArray(extra) || !extra) throw badRequest('Invalid extra')

  await replaceBase64ImagesInExtra({ event, db, createdBy: session.sub, extra })

  await db.insert(contentTable).values({
    id,
    schemaKey,
    schemaVersion: active.version,
    title,
    status,
    extraJson: JSON.stringify(extra),
    createdBy: session.sub,
    createdAt: now,
    updatedAt: now
  })

  await syncContentRefs({ db, contentId: id, registry: active.registry, extra })

  return { ok: true, id }
})
