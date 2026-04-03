import { getQuery } from 'h3'
import { and, asc, desc, eq, gte, inArray, lt, lte } from 'drizzle-orm'

import type { FieldKind } from '../cms/types'
import { getDb } from '../db/db'
import { content as contentTable, contentListing as contentListingTable, searchConfig } from '../db/schema'
import { parseContentJson } from '../cms/content-json'
import {
  buildSearchDataRecord,
  coerceSearchValue,
  jsonValueExpression,
  searchDataTypeForKind
} from '../cms/search-helpers'
import { badRequest } from '../utils/http'

type FilterInput = {
  field: string
  op?: 'exact' | 'range' | 'exact_set'
  value?: unknown
  values?: unknown
  min?: unknown
  max?: unknown
}

type ContentFieldRow = typeof searchConfig.$inferSelect

function parseFilters(raw: unknown) {
  if (!raw) return []
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed as FilterInput[]
      return [parsed as FilterInput]
    } catch {
      throw badRequest('Invalid filters')
    }
  }
  if (Array.isArray(raw)) return raw as FilterInput[]
  if (typeof raw === 'object') return [raw as FilterInput]
  throw badRequest('Invalid filters')
}

function ensureArray(value: unknown) {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []
    return trimmed.split(',').map(v => v.trim()).filter(Boolean)
  }
  if (value == null) return []
  return [value]
}

export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const schemaKey = typeof q.schemaKey === 'string' ? q.schemaKey : null
  if (!schemaKey) throw badRequest('schemaKey required')

  const limit = Math.min(Number(q.limit ?? 20) || 20, 50)
  const cursor = q.cursor ? new Date(Number(q.cursor)) : null
  const status = typeof q.status === 'string' ? q.status : null

  const sortParam = typeof q.sort === 'string' ? q.sort : null
  const sortField = typeof q.sortField === 'string' ? q.sortField : null
  const sortDirParam = typeof q.sortDir === 'string' ? q.sortDir : null
  const requestedFields = ensureArray((q as any).fields)

  let sortKey: string | null = sortField
  let sortDir: 'asc' | 'desc' = sortDirParam === 'desc' ? 'desc' : 'asc'
  if (sortParam && !sortKey) {
    const [field, dir] = sortParam.split(':')
    sortKey = field || null
    if (dir === 'desc') sortDir = 'desc'
  }

  const filters = parseFilters(q.filters)
  const db = await getDb(event)

  const fieldRows = await db
    .select()
    .from(searchConfig)
    .where(eq(searchConfig.schemaKey, schemaKey)) as ContentFieldRow[]

  const fieldByKey = new Map(fieldRows.map(row => [row.fieldKey, row]))

  const whereParts = [eq(contentTable.schemaKey, schemaKey)] as any[]
  if (status) whereParts.push(eq(contentTable.status, status))
  if (cursor && !sortKey) whereParts.push(lt(contentTable.updatedAt, cursor))

  for (const filter of filters) {
    if (!filter?.field || typeof filter.field !== 'string') throw badRequest('Filter field required')
    const config = fieldByKey.get(filter.field)
    if (!config) throw badRequest(`Unknown field: ${filter.field}`)
    if (!config.filterable) throw badRequest(`Field not filterable: ${filter.field}`)

    const kind = config.kind as FieldKind
    const dataType = searchDataTypeForKind(kind as any)
    if (!dataType) throw badRequest(`Unsupported field type: ${filter.field}`)

    const op = filter.op ?? (config.searchMode as 'exact' | 'range' | 'exact_set' | 'off')
    if (!op || op === 'off') throw badRequest(`Search mode disabled: ${filter.field}`)
    if (op === 'range' && dataType === 'text') throw badRequest(`Range not supported: ${filter.field}`)

    const expr = jsonValueExpression(contentTable.contentJson, config.fieldKey, kind)

    if (dataType === 'text') {
      if (op === 'exact') {
        const value = coerceSearchValue({ kind, enumValues: [] } as any, filter.value)
        if (value == null) throw badRequest(`Invalid value: ${filter.field}`)
        whereParts.push(eq(expr, value as string))
      } else if (op === 'exact_set') {
        const values = ensureArray(filter.values ?? filter.value)
          .map(v => coerceSearchValue({ kind, enumValues: [] } as any, v))
          .filter((value): value is string => typeof value === 'string')
        if (!values.length) throw badRequest(`Invalid values: ${filter.field}`)
        whereParts.push(inArray(expr, values))
      } else {
        throw badRequest(`Unsupported filter: ${filter.field}`)
      }
      continue
    }

    if (op === 'exact') {
      const value = coerceSearchValue({ kind } as any, filter.value)
      if (typeof value !== 'number') throw badRequest(`Invalid value: ${filter.field}`)
      whereParts.push(eq(expr, value))
      continue
    }

    if (op === 'exact_set') {
      const values = ensureArray(filter.values ?? filter.value)
        .map(v => coerceSearchValue({ kind } as any, v))
        .filter((value): value is number => typeof value === 'number')
      if (!values.length) throw badRequest(`Invalid values: ${filter.field}`)
      whereParts.push(inArray(expr, values))
      continue
    }

    if (op === 'range') {
      const min = filter.min != null ? coerceSearchValue({ kind } as any, filter.min) : null
      const max = filter.max != null ? coerceSearchValue({ kind } as any, filter.max) : null
      if (typeof min !== 'number' && typeof max !== 'number') {
        throw badRequest(`Range requires min or max: ${filter.field}`)
      }
      if (typeof min === 'number') whereParts.push(gte(expr, min))
      if (typeof max === 'number') whereParts.push(lte(expr, max))
      continue
    }

    throw badRequest(`Unsupported filter: ${filter.field}`)
  }

  let query = db
    .select({
      id: contentTable.id,
      schemaKey: contentTable.schemaKey,
      schemaVersion: contentTable.schemaVersion,
      title: contentListingTable.title,
      description: contentListingTable.description,
      image: contentListingTable.image,
      status: contentTable.status,
      createdAt: contentTable.createdAt,
      updatedAt: contentTable.updatedAt,
      contentJson: contentTable.contentJson
    })
    .from(contentTable)
    .leftJoin(contentListingTable, eq(contentListingTable.contentId, contentTable.id))
    .where(and(...whereParts))
    .limit(limit)

  if (sortKey) {
    const config = fieldByKey.get(sortKey)
    if (!config) throw badRequest(`Unknown sort field: ${sortKey}`)
    if (!config.sortable) throw badRequest(`Field not sortable: ${sortKey}`)

    const sortExpr = jsonValueExpression(contentTable.contentJson, config.fieldKey, config.kind as FieldKind)
    query = query.orderBy(
      sortDir === 'desc' ? desc(sortExpr) : asc(sortExpr),
      desc(contentTable.updatedAt),
      desc(contentTable.id)
    )
  } else {
    query = query.orderBy(desc(contentTable.updatedAt), desc(contentTable.id))
  }

  const rows = await query
  const nextCursor = !sortKey && rows.length
    ? String(new Date(rows[rows.length - 1]!.updatedAt).getTime())
    : null

  const fieldConfigs = requestedFields
    .map(fieldKey => fieldByKey.get(String(fieldKey)))
    .filter((field): field is ContentFieldRow => Boolean(field))

  const items = rows.map((row: (typeof rows)[number]) => {
    const content = fieldConfigs.length ? parseContentJson(row.contentJson) : null
    const item = {
      id: row.id,
      schemaKey: row.schemaKey,
      schemaVersion: row.schemaVersion,
      title: row.title,
      description: row.description,
      image: row.image,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }

    if (!content) return item

    return {
      ...item,
      searchData: buildSearchDataRecord(
        fieldConfigs.map(field => ({
          key: field.fieldKey,
          kind: field.kind as any
        })),
        content
      )
    }
  })

  return { items, nextCursor }
})
