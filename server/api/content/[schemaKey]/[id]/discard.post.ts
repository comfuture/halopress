import { and, eq } from 'drizzle-orm'

import { discardContentWorking } from '../../../../cms/content-publication'
import { getDb } from '../../../../db/db'
import { content as contentTable } from '../../../../db/schema'
import { notFound } from '../../../../utils/http'
import { requireSchemaPermission } from '../../../../utils/schema-permission'

export default defineEventHandler(async (event) => {
  const schemaKey = event.context.params?.schemaKey as string
  const id = event.context.params?.id as string
  await requireSchemaPermission(event, schemaKey, 'write')
  const db = await getDb(event)
  const existing = await db.select().from(contentTable).where(and(
    eq(contentTable.schemaKey, schemaKey),
    eq(contentTable.id, id)
  )).get()
  if (!existing) throw notFound('Content not found')
  return { ok: true, ...(await discardContentWorking({ event, db, existing, schemaKey })) }
})
