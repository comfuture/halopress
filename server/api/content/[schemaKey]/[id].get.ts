import { and, eq } from 'drizzle-orm'

import { getDb } from '../../../db/db'
import { getAuthSession } from '../../../utils/auth'
import { notFound, unauthorized } from '../../../utils/http'
import { content as contentTable } from '../../../db/schema'

export default defineEventHandler(async (event) => {
  const schemaKey = event.context.params?.schemaKey as string
  const id = event.context.params?.id as string

  const db = await getDb(event)
  const row = await db
    .select()
    .from(contentTable)
    .where(and(eq(contentTable.schemaKey, schemaKey), eq(contentTable.id, id)))
    .get()

  if (!row) throw notFound('Content not found')

  if (row.status !== 'published') {
    const session = await getAuthSession(event)
    if (!session) throw unauthorized()
  }

  return {
    id: row.id,
    schemaKey: row.schemaKey,
    schemaVersion: row.schemaVersion,
    title: row.title,
    status: row.status,
    extra: JSON.parse(row.extraJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
})
