import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { getQuery, setHeader } from 'h3'

import { getDb } from '../../db/db'
import { content as contentTable, contentListing as contentListingTable, contentRefList, searchConfig } from '../../db/schema'
import { coerceSearchValue, jsonPathForFieldKey, searchDataTypeForKind } from '../../cms/search-helpers'
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

function jsonValueExpression(fieldKey: string, kind: string) {
  const path = jsonPathForFieldKey(fieldKey)

  if (kind === 'number') {
    return sql<number | null>`CAST(json_extract(${contentTable.contentJson}, ${path}) AS REAL)`
  }

  if (kind === 'integer' || kind === 'boolean') {
    return sql<number | null>`CAST(json_extract(${contentTable.contentJson}, ${path}) AS INTEGER)`
  }

  if (kind === 'date' || kind === 'datetime') {
    return sql<number | null>`(unixepoch(json_extract(${contentTable.contentJson}, ${path})) * 1000)`
  }

  return sql<string | null>`json_extract(${contentTable.contentJson}, ${path})`
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
        eq(contentListingTable.schemaKey, schemaKey),
        inArray(contentListingTable.contentId, orderedIds)
      ] as any[]
      if (whereStatus) whereParts.push(eq(contentTable.status, status))

      const items = await db
        .select({
          id: contentListingTable.contentId,
          schemaKey: contentListingTable.schemaKey,
          schemaVersion: contentListingTable.schemaVersion,
          title: contentListingTable.title,
          description: contentListingTable.description,
          image: contentListingTable.image,
          status: contentTable.status,
          createdAt: contentListingTable.createdAt,
          updatedAt: contentListingTable.updatedAt
        })
        .from(contentListingTable)
        .innerJoin(contentTable, eq(contentTable.id, contentListingTable.contentId))
        .where(and(...whereParts)) as ContentItem[]

      const byId = new Map(items.map(item => [item.id, item]))
      return orderedIds
        .map(id => byId.get(id))
        .filter((item): item is ContentItem => Boolean(item))
    }

    if (!values.length) throw badRequest('values required')

    const field = await db
      .select({
        fieldKey: searchConfig.fieldKey,
        kind: searchConfig.kind
      })
      .from(searchConfig)
      .where(and(
        eq(searchConfig.schemaKey, schemaKey),
        eq(searchConfig.fieldKey, fieldKey)
      ))
      .get()

    if (!field) return []

    const dataType = searchDataTypeForKind(field.kind as any)
    if (!dataType) return []

    const expr = jsonValueExpression(field.fieldKey, field.kind)
    const coercedValues = values
      .map(value => coerceSearchValue({ kind: field.kind as any, enumValues: [] } as any, value))
      .filter((value): value is string | number => typeof value === 'string' || typeof value === 'number')
    if (!coercedValues.length) return []

    const whereParts = [
      eq(contentListingTable.schemaKey, schemaKey),
      inArray(expr, coercedValues),
      eq(contentListingTable.contentId, contentTable.id)
    ] as any[]
    if (whereStatus) whereParts.push(eq(contentTable.status, status))

    const items = await db
      .select({
        id: contentListingTable.contentId,
        schemaKey: contentListingTable.schemaKey,
        schemaVersion: contentListingTable.schemaVersion,
        title: contentListingTable.title,
        description: contentListingTable.description,
        image: contentListingTable.image,
        status: contentTable.status,
        createdAt: contentListingTable.createdAt,
        updatedAt: contentListingTable.updatedAt
      })
      .from(contentListingTable)
      .innerJoin(contentTable, eq(contentTable.id, contentListingTable.contentId))
      .where(and(...whereParts))
      .orderBy(desc(contentListingTable.updatedAt), desc(contentListingTable.contentId))
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
