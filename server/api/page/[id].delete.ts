import { and, eq } from 'drizzle-orm'

import { getDb } from '../../db/db'
import { documentAssetRef, page as pageTable } from '../../db/schema'
import { executeDbStatement, withDbTransaction } from '../../db/transaction'
import { requireAdmin } from '../../utils/auth'
import { notFound } from '../../utils/http'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = event.context.params?.id as string
  if (!id) throw notFound('Page not found')
  const db = await getDb(event)
  const existing = await db.select({ id: pageTable.id }).from(pageTable).where(eq(pageTable.id, id)).get()
  if (!existing) throw notFound('Page not found')
  await withDbTransaction(event, db, async (tx: any, statements) => {
    await executeDbStatement(tx.update(pageTable).set({
      status: 'deleted',
      publishedRevisionId: null,
      publishedAt: null,
      updatedAt: new Date()
    }).where(eq(pageTable.id, id)), statements)
    await executeDbStatement(tx.delete(documentAssetRef).where(and(
      eq(documentAssetRef.documentKind, 'page'),
      eq(documentAssetRef.documentId, id),
      eq(documentAssetRef.projectionScope, 'published')
    )), statements)
  })
  return { ok: true }
})
