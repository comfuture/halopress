import { and, desc, eq, lt } from 'drizzle-orm'
import { getQuery } from 'h3'

import { getDb } from '../../../db/db'
import { content as contentTable, contentRef as contentRefTable } from '../../../db/schema'

export default defineEventHandler(async (event) => {
  const schemaKey = event.context.params?.schemaKey as string
  const q = getQuery(event)
  const limit = Math.min(Number(q.limit ?? 20) || 20, 50)
  const cursor = q.cursor ? new Date(Number(q.cursor)) : null
  const status = typeof q.status === 'string' ? q.status : null

  const refField = typeof q.refField === 'string' ? q.refField : null
  const refId = typeof q.refId === 'string' ? q.refId : null

  const db = await getDb(event)

  const whereParts = [eq(contentTable.schemaKey, schemaKey)] as any[]
  if (status) whereParts.push(eq(contentTable.status, status))
  if (cursor) whereParts.push(lt(contentTable.updatedAt, cursor))

  const base = db
    .select({
      id: contentTable.id,
      schemaKey: contentTable.schemaKey,
      schemaVersion: contentTable.schemaVersion,
      title: contentTable.title,
      status: contentTable.status,
      createdAt: contentTable.createdAt,
      updatedAt: contentTable.updatedAt
    })
    .from(contentTable)

  let query = base
    .where(and(...whereParts))
    .orderBy(desc(contentTable.updatedAt))
    .limit(limit)

  if (refField && refId) {
    query = base
      .innerJoin(contentRefTable, and(
        eq(contentRefTable.contentId, contentTable.id),
        eq(contentRefTable.fieldPath, refField),
        eq(contentRefTable.targetId, refId)
      ))
      .where(and(...whereParts))
      .orderBy(desc(contentTable.updatedAt))
      .limit(limit)
  }

  const items = await query

  const nextCursor = items.length ? String(new Date(items[items.length - 1]!.updatedAt).getTime()) : null
  return { items, nextCursor }
})
