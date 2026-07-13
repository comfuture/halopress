import { and, eq } from 'drizzle-orm'

import { getDb } from '../../../db/db'
import { notFound } from '../../../utils/http'
import { content as contentTable, contentListing as contentListingTable } from '../../../db/schema'
import { executeDbStatement, withDbTransaction } from '../../../db/transaction'
import { queueWidgetCacheInvalidation } from '../../../utils/widget-cache'
import { requireSchemaPermission } from '../../../utils/schema-permission'

export default defineEventHandler(async (event) => {
  const schemaKey = event.context.params?.schemaKey as string
  const id = event.context.params?.id as string
  await requireSchemaPermission(event, schemaKey, 'admin')
  const db = await getDb(event)

  const existing = await db
    .select({ id: contentTable.id })
    .from(contentTable)
    .where(and(eq(contentTable.schemaKey, schemaKey), eq(contentTable.id, id)))
    .get()
  if (!existing) throw notFound('Content not found')

  await withDbTransaction(event, db, async (tx: any, statements) => {
    const now = new Date()
    await executeDbStatement(tx
      .update(contentTable)
      .set({ status: 'deleted', updatedAt: now })
      .where(eq(contentTable.id, id)), statements)

    await executeDbStatement(tx
      .update(contentListingTable)
      .set({ status: 'deleted', updatedAt: now })
      .where(eq(contentListingTable.contentId, id)), statements)
  })

  queueWidgetCacheInvalidation(event, `schema:${schemaKey}`)

  return { ok: true }
})
