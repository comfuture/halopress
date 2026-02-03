import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { getQuery, setHeader } from 'h3'

import { getDb } from '../../db/db'
import { contentItems as contentItemsTable, contentRefList, contentSearchConfig, contentSearchData } from '../../db/schema'
import { badRequest } from '../../utils/http'
import { applyWidgetCacheHeaders, resolveWidgetCacheKey, withWidgetCache } from '../../utils/widget-cache'

type ContentItem = {
  id: string
  schemaKey: string
  schemaVersion: number
  title: string | null
  description: string | null
  image: string | null
  status: string
  createdAt: Date
  updatedAt: Date
}

const POLICY = {
  softTtl: 300,
  hardTtl: 7200,
  staleIfError: 86400
}

export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const schemaKey = typeof q.schema === 'string'
    ? q.schema
    : (typeof q.schemaKey === 'string' ? q.schemaKey : null)

  if (!schemaKey) throw badRequest('schema required')

  const fieldKey = typeof q.field === 'string' ? q.field : null
  if (!fieldKey) throw badRequest('field required')

  const ownerId = typeof q.ownerId === 'string'
    ? q.ownerId
    : (typeof q.curationId === 'string' ? q.curationId : null)

  const rawValues = q.values
  const values = Array.isArray(rawValues)
    ? rawValues.map(v => String(v)).filter(Boolean)
    : typeof rawValues === 'string'
      ? rawValues.split(',').map(v => v.trim()).filter(Boolean)
      : []

  const limit = Math.min(Number(q.limit ?? 6) || 6, 50)
  const status = typeof q.status === 'string' ? q.status : 'published'

  const params = { schemaKey, fieldKey, values, ownerId, limit, status }
  const cacheKey = await resolveWidgetCacheKey(event, 'curation', 'v1', params, `schema:${schemaKey}`)

  applyWidgetCacheHeaders(event, POLICY, ['widget', 'curation', schemaKey, fieldKey])

  const { data, status: cacheStatus, backend } = await withWidgetCache(event, cacheKey, POLICY, async () => {
    const db = await getDb(event)
    const whereStatus = status && status !== 'all'

    if (ownerId) {
      const listRows = await db
        .select({
          itemId: contentRefList.itemId,
          position: contentRefList.position
        })
        .from(contentRefList)
        .where(and(
          eq(contentRefList.ownerContentId, ownerId),
          eq(contentRefList.fieldKey, fieldKey),
          eq(contentRefList.itemKind, 'content')
        ))
        .orderBy(asc(contentRefList.position))
        .limit(limit) as Array<{ itemId: string | null; position: number | null }>

      const orderedIds = listRows
        .map(row => row.itemId)
        .filter((id): id is string => Boolean(id))
      if (!orderedIds.length) return []

      const whereParts = [
        eq(contentItemsTable.schemaKey, schemaKey),
        inArray(contentItemsTable.contentId, orderedIds)
      ] as any[]
      if (whereStatus) whereParts.push(eq(contentItemsTable.status, status))

      const items = await db
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
        .where(and(...whereParts)) as ContentItem[]

      const byId = new Map(items.map(item => [item.id, item]))
      return orderedIds
        .map(id => byId.get(id))
        .filter((item): item is ContentItem => Boolean(item))
    }

    if (!values.length) throw badRequest('values required')

    const field = await db
      .select({ fieldId: contentSearchConfig.fieldId })
      .from(contentSearchConfig)
      .where(and(
        eq(contentSearchConfig.schemaKey, schemaKey),
        eq(contentSearchConfig.fieldKey, fieldKey)
      ))
      .get()

    if (!field?.fieldId) return []

    const ids = await db
      .select({ contentId: contentSearchData.contentId })
      .from(contentSearchData)
      .where(and(
        eq(contentSearchData.fieldId, field.fieldId),
        eq(contentSearchData.dataType, 'text'),
        inArray(contentSearchData.text, values)
      )) as Array<{ contentId: string }>

    const contentIds = Array.from(new Set(ids.map(row => row.contentId)))
    if (!contentIds.length) return []

    const whereParts = [
      eq(contentItemsTable.schemaKey, schemaKey),
      inArray(contentItemsTable.contentId, contentIds)
    ] as any[]
    if (whereStatus) whereParts.push(eq(contentItemsTable.status, status))

    const items = await db
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
      .orderBy(desc(contentItemsTable.updatedAt), desc(contentItemsTable.contentId))
      .limit(limit) as ContentItem[]

    return items
  })

  setHeader(event, 'X-Widget-Cache', cacheStatus)
  setHeader(event, 'X-Widget-Cache-Backend', backend)

  return {
    widget: 'curation',
    schemaKey,
    fieldKey,
    ownerId,
    values,
    items: data
  }
})
