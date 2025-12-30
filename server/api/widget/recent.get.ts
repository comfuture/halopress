import { and, asc, desc, eq } from 'drizzle-orm'
import { getQuery, setHeader } from 'h3'

import { getDb } from '../../db/db'
import { contentItems as contentItemsTable } from '../../db/schema'
import { badRequest } from '../../utils/http'
import { applyWidgetCacheHeaders, resolveWidgetCacheKey, withWidgetCache } from '../../utils/widget-cache'

const POLICY = {
  softTtl: 60,
  hardTtl: 300,
  staleIfError: 86400
}

export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const schemaKey = typeof q.schema === 'string'
    ? q.schema
    : (typeof q.schemaKey === 'string' ? q.schemaKey : null)

  if (!schemaKey) throw badRequest('schema required')

  const limit = Math.min(Number(q.limit ?? 6) || 6, 50)
  const status = typeof q.status === 'string' ? q.status : 'published'
  const sortRaw = typeof q.sort === 'string' && q.sort.length ? q.sort : '-created'
  const sortDesc = sortRaw.startsWith('-')
  const sortKey = sortDesc ? sortRaw.slice(1) : sortRaw
  const sortField = sortKey === 'updated' || sortKey === 'updatedAt' ? 'updatedAt' : 'createdAt'
  const sortNormalized = `${sortDesc ? '-' : ''}${sortField === 'createdAt' ? 'created' : 'updated'}`

  const params = { schemaKey, limit, status, sort: sortNormalized }
  const cacheKey = await resolveWidgetCacheKey(event, 'recent', 'v1', params, `schema:${schemaKey}`)

  applyWidgetCacheHeaders(event, POLICY, ['widget', 'recent', schemaKey])

  const { data, status: cacheStatus, backend } = await withWidgetCache(event, cacheKey, POLICY, async () => {
    const db = await getDb(event)
    const whereParts = [eq(contentItemsTable.schemaKey, schemaKey)] as any[]
    if (status && status !== 'all') whereParts.push(eq(contentItemsTable.status, status))

    const orderField = sortField === 'updatedAt' ? contentItemsTable.updatedAt : contentItemsTable.createdAt
    const orderTie = sortDesc ? desc(contentItemsTable.contentId) : asc(contentItemsTable.contentId)
    const orderPrimary = sortDesc ? desc(orderField) : asc(orderField)

    return db
      .select({
        id: contentItemsTable.contentId,
        schemaKey: contentItemsTable.schemaKey,
        schemaVersion: contentItemsTable.schemaVersion,
        title: contentItemsTable.title,
        description: contentItemsTable.description,
        image: contentItemsTable.image,
        status: contentItemsTable.status,
        createdAt: contentItemsTable.createdAt,
        updatedAt: contentItemsTable.updatedAt
      })
      .from(contentItemsTable)
      .where(and(...whereParts))
      .orderBy(orderPrimary, orderTie)
      .limit(limit)
  })

  setHeader(event, 'X-Widget-Cache', cacheStatus)
  setHeader(event, 'X-Widget-Cache-Backend', backend)

  return {
    widget: 'recent',
    schemaKey,
    items: data
  }
})
