import { and, eq } from 'drizzle-orm'

import { getDb } from '../../../db/db'
import { requireAdmin } from '../../../utils/auth'
import { notFound } from '../../../utils/http'
import { content as contentTable, contentItems as contentItemsTable } from '../../../db/schema'
import { queueWidgetCacheInvalidation } from '../../../utils/widget-cache'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const schemaKey = event.context.params?.schemaKey as string
  const id = event.context.params?.id as string
  const db = await getDb(event)

  await db.transaction(async (tx: any) => {
    const existing = await tx
      .select({ id: contentTable.id })
      .from(contentTable)
      .where(and(eq(contentTable.schemaKey, schemaKey), eq(contentTable.id, id)))
      .get()
    if (!existing) throw notFound('Content not found')

    const now = new Date()
    await tx
      .update(contentTable)
      .set({ status: 'deleted', updatedAt: now })
      .where(eq(contentTable.id, id))

    await tx
      .update(contentItemsTable)
      .set({ status: 'deleted', updatedAt: now })
      .where(eq(contentItemsTable.contentId, id))
  })

  queueWidgetCacheInvalidation(event, `schema:${schemaKey}`)

  return { ok: true }
})
