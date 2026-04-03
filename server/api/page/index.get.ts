import { desc, eq } from 'drizzle-orm'
import { getQuery } from 'h3'

import { getDb } from '../../db/db'
import { page as pageTable } from '../../db/schema'
import { requireAdmin } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const q = getQuery(event)
  const limit = Math.min(Number(q.limit ?? 50) || 50, 200)
  const status = typeof q.status === 'string' && q.status.length ? q.status : null

  const db = await getDb(event)
  let query = db
    .select({
      id: pageTable.id,
      title: pageTable.title,
      status: pageTable.status,
      createdAt: pageTable.createdAt,
      updatedAt: pageTable.updatedAt
    })
    .from(pageTable)
    .orderBy(desc(pageTable.updatedAt))
    .limit(limit)

  if (status) {
    query = query.where(eq(pageTable.status, status))
  }

  const items = await query
  return { items }
})
