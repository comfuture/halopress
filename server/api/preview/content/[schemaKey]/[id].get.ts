import { and, eq } from 'drizzle-orm'

import { parseContentJson } from '../../../../cms/content-json'
import { publicationMetadata } from '../../../../cms/publication'
import { getDb } from '../../../../db/db'
import { content as contentTable } from '../../../../db/schema'
import { getAuthSession } from '../../../../utils/auth'
import { applyPreviewDeliveryHeaders } from '../../../../utils/delivery-policy'
import { notFound } from '../../../../utils/http'
import { requireSchemaPermission } from '../../../../utils/schema-permission'

export default defineEventHandler(async (event) => {
  const schemaKey = event.context.params?.schemaKey as string
  const id = event.context.params?.id as string
  const session = await getAuthSession(event)
  if (!session?.user) throw notFound('Content not found')
  await requireSchemaPermission(event, schemaKey, 'read')
  applyPreviewDeliveryHeaders(event)
  const db = await getDb(event)
  const row = await db.select().from(contentTable).where(and(
    eq(contentTable.schemaKey, schemaKey),
    eq(contentTable.id, id)
  )).get()
  if (!row || row.status === 'deleted') throw notFound('Content not found')
  return {
    id: row.id,
    schemaKey: row.schemaKey,
    schemaVersion: row.schemaVersion,
    status: row.status,
    content: parseContentJson(row.contentJson),
    updatedAt: row.updatedAt,
    ...publicationMetadata(row)
  }
})
