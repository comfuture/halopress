import { and, asc, desc, eq, gt, lt, sql } from 'drizzle-orm'
import { getQuery } from 'h3'

import { getDb } from '../../../db/db'
import { content as contentTable, contentItems as contentItemsTable, contentRef as contentRefTable } from '../../../db/schema'

export default defineEventHandler(async (event) => {
  const schemaKey = event.context.params?.schemaKey as string
  const q = getQuery(event)
  const pageSize = Math.min(Number(q.pageSize ?? q.limit ?? 20) || 20, 50)
  const cursor = typeof q.cursor === 'string' && q.cursor.length ? q.cursor : null
  const order = q.order === 'asc' ? 'asc' : 'desc'
  const status = typeof q.status === 'string' ? q.status : null

  const refField = typeof q.refField === 'string' ? q.refField : null
  const refId = typeof q.refId === 'string' ? q.refId : null

  const db = await getDb(event)

  const whereParts = [eq(contentTable.schemaKey, schemaKey)] as any[]
  if (status) whereParts.push(eq(contentTable.status, status))
  if (cursor) {
    whereParts.push(order === 'asc'
      ? gt(contentTable.id, cursor)
      : lt(contentTable.id, cursor))
  }

  const assetIdSubquery = sql<string | null>`(select ${contentRefTable.targetId} from ${contentRefTable} where ${contentRefTable.contentId} = ${contentTable.id} and ${contentRefTable.targetKind} = 'asset' limit 1)`

  const base = db
    .select({
      id: contentTable.id,
      schemaKey: contentTable.schemaKey,
      schemaVersion: contentTable.schemaVersion,
      title: contentTable.title,
      description: contentItemsTable.description,
      image: contentItemsTable.image,
      status: contentTable.status,
      createdAt: contentTable.createdAt,
      updatedAt: contentTable.updatedAt,
      assetId: assetIdSubquery
    })
    .from(contentTable)
    .leftJoin(contentItemsTable, eq(contentItemsTable.contentId, contentTable.id))

  const fetchSize = pageSize + 1

  let query = base
    .where(and(...whereParts))
    .orderBy(order === 'asc' ? asc(contentTable.id) : desc(contentTable.id))
    .limit(fetchSize)

  if (refField && refId) {
    query = base
      .innerJoin(contentRefTable, and(
        eq(contentRefTable.contentId, contentTable.id),
        eq(contentRefTable.fieldPath, refField),
        eq(contentRefTable.targetId, refId)
      ))
      .where(and(...whereParts))
      .orderBy(order === 'asc' ? asc(contentTable.id) : desc(contentTable.id))
      .limit(fetchSize)
  }

  const rows = await query
  const hasMore = rows.length > pageSize
  const items = hasMore ? rows.slice(0, pageSize) : rows

  const nextCursor = hasMore ? String(items[items.length - 1]!.id) : null
  return { items, nextCursor }
})
