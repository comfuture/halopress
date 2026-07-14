import { and, eq } from 'drizzle-orm'
import { readBody } from 'h3'

import { saveContentWorking } from '../../../cms/content-publication'
import { parseContentJson } from '../../../cms/content-json'
import { validateContentJson } from '../../../cms/content-validation'
import { getActiveSchema } from '../../../cms/repo'
import { getDb } from '../../../db/db'
import { content as contentTable } from '../../../db/schema'
import { getAuthSession } from '../../../utils/auth'
import { badRequest, notFound } from '../../../utils/http'
import { requireSchemaPermission } from '../../../utils/schema-permission'
import { requireExpectedRevision } from '../../../cms/document-revisions'
import { assertDraftWriteStatus } from '../../../cms/publication-transitions'

export default defineEventHandler(async (event) => {
  const schemaKey = event.context.params?.schemaKey as string
  const id = event.context.params?.id as string
  await requireSchemaPermission(event, schemaKey, 'write')
  const session = await getAuthSession(event)
  const actorId = (session?.user as any)?.id ?? null
  const body = await readBody<{ revision?: number, status?: string, content?: Record<string, unknown> }>(event)
  assertDraftWriteStatus(body?.status)
  const expectedRevision = requireExpectedRevision(body?.revision)

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
  const publication = await saveContentWorking({
    event,
    db,
    existing,
    schemaKey,
    active: active as any,
    content,
    actorId,
    expectedRevision
  })
  return { ok: true, ...publication }
})
