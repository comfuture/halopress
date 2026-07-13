import { and, eq } from 'drizzle-orm'
import { readBody } from 'h3'

import { publishContentWorking, saveContentWorking } from '../../../cms/content-publication'
import { parseContentJson } from '../../../cms/content-json'
import { validateContentJson } from '../../../cms/content-validation'
import { getActiveSchema } from '../../../cms/repo'
import { getDb } from '../../../db/db'
import { content as contentTable } from '../../../db/schema'
import { getAuthSession } from '../../../utils/auth'
import { badRequest, notFound } from '../../../utils/http'
import { requireSchemaPermission } from '../../../utils/schema-permission'
import { queueWidgetCacheInvalidation } from '../../../utils/widget-cache'

export default defineEventHandler(async (event) => {
  const schemaKey = event.context.params?.schemaKey as string
  const id = event.context.params?.id as string
  await requireSchemaPermission(event, schemaKey, 'write')
  const session = await getAuthSession(event)
  const actorId = (session?.user as any)?.id ?? null
  const body = await readBody<{ status?: string, content?: Record<string, unknown> }>(event)
  if (body?.status === 'deleted') throw badRequest('Use the delete endpoint to delete content')

  const db = await getDb(event)
  const active = await getActiveSchema(db, schemaKey)
  if (!active?.registry) throw notFound('Active schema not found')
  const existing = await db.select().from(contentTable).where(and(
    eq(contentTable.schemaKey, schemaKey),
    eq(contentTable.id, id)
  )).get()
  if (!existing) throw notFound('Content not found')

  const input = body?.content ?? parseContentJson(existing.contentJson)
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw badRequest('Invalid content')
  const content = validateContentJson(active.jsonSchema, input)
  const workingStatus = body?.status ?? (existing.status === 'published' ? 'draft' : existing.status)
  const publication = body?.status === 'published'
    ? await publishContentWorking({ event, db, existing, schemaKey, active: active as any, content, actorId })
    : await saveContentWorking({
        event,
        db,
        existing,
        schemaKey,
        active: active as any,
        content,
        actorId,
        status: workingStatus
      })

  if (body?.status === 'published') queueWidgetCacheInvalidation(event, 'schema:' + schemaKey)
  return { ok: true, ...publication }
})
