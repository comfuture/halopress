import { and, eq } from 'drizzle-orm'

import { getDb } from '../../../db/db'
import { requireAdmin } from '../../../utils/auth'
import { notFound } from '../../../utils/http'
import { content as contentTable } from '../../../db/schema'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const schemaKey = event.context.params?.schemaKey as string
  const id = event.context.params?.id as string
  const db = await getDb(event)

  const existing = await db
    .select({ id: contentTable.id })
    .from(contentTable)
    .where(and(eq(contentTable.schemaKey, schemaKey), eq(contentTable.id, id)))
    .get()
  if (!existing) throw notFound('Content not found')

  await db
    .update(contentTable)
    .set({ status: 'deleted', updatedAt: new Date() })
    .where(eq(contentTable.id, id))

  return { ok: true }
})
