import { getQuery } from 'h3'
import { and, asc, desc, eq, exists, inArray, lt, gte, lte, sql } from 'drizzle-orm'

import { getDb } from '../db/db'
import { content as contentTable, contentFields as contentFieldsTable, contentDateData, contentNumberData, contentStringData } from '../db/schema'
import { badRequest } from '../utils/http'
import { coerceSearchValue, searchTableForKind } from '../cms/search-index'

type FilterInput = {
  field: string
  op?: 'exact' | 'range' | 'exact_set'
  value?: unknown
  values?: unknown
  min?: unknown
  max?: unknown
}

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
    .from(contentFieldsTable)
    .where(eq(contentFieldsTable.schemaKey, schemaKey))

  const fieldByKey = new Map(fieldRows.map(row => [row.fieldKey, row]))

  const whereParts = [eq(contentTable.schemaKey, schemaKey)] as any[]
  if (status) whereParts.push(eq(contentTable.status, status))
  if (cursor && !sortKey) whereParts.push(lt(contentTable.updatedAt, cursor))

  for (const filter of filters) {
    if (!filter?.field || typeof filter.field !== 'string') throw badRequest('Filter field required')
    const config = fieldByKey.get(filter.field)
    if (!config) throw badRequest(`Unknown field: ${filter.field}`)
    if (!config.filterable) throw badRequest(`Field not filterable: ${filter.field}`)

    const kind = config.kind as any
    const tableKind = searchTableForKind(kind)
    if (!tableKind) throw badRequest(`Unsupported field type: ${filter.field}`)

    const op = filter.op ?? (config.searchMode as 'exact' | 'range' | 'exact_set' | 'off')
    if (!op || op === 'off') throw badRequest(`Search mode disabled: ${filter.field}`)

    if (op === 'range' && tableKind === 'string') throw badRequest(`Range not supported: ${filter.field}`)

    let existsQuery: any = null

    if (tableKind === 'string') {
      const baseConditions = [
        eq(contentStringData.contentId, contentTable.id),
        eq(contentStringData.fieldId, config.fieldId)
      ]

      if (op === 'exact') {
        const value = coerceSearchValue({ kind, enumValues: [] } as any, filter.value)
        if (value == null) throw badRequest(`Invalid value: ${filter.field}`)
        existsQuery = db
          .select({ one: sql`1` })
          .from(contentStringData)
          .where(and(...baseConditions, eq(contentStringData.value, value as string)))
      } else if (op === 'exact_set') {
        const values = ensureArray(filter.values ?? filter.value)
          .map(v => coerceSearchValue({ kind, enumValues: [] } as any, v))
          .filter(v => v != null) as string[]
        if (!values.length) throw badRequest(`Invalid values: ${filter.field}`)
        existsQuery = db
          .select({ one: sql`1` })
          .from(contentStringData)
          .where(and(...baseConditions, inArray(contentStringData.value, values)))
      }
      if (!existsQuery) throw badRequest(`Unsupported filter: ${filter.field}`)
      whereParts.push(exists(existsQuery))
      continue
    }

    if (tableKind === 'number') {
      const baseConditions = [
        eq(contentNumberData.contentId, contentTable.id),
        eq(contentNumberData.fieldId, config.fieldId)
      ]

      if (op === 'exact') {
        const value = coerceSearchValue({ kind } as any, filter.value)
        if (value == null) throw badRequest(`Invalid value: ${filter.field}`)
        existsQuery = db
          .select({ one: sql`1` })
          .from(contentNumberData)
          .where(and(...baseConditions, eq(contentNumberData.value, value as number)))
      } else if (op === 'exact_set') {
        const values = ensureArray(filter.values ?? filter.value)
          .map(v => coerceSearchValue({ kind } as any, v))
          .filter(v => typeof v === 'number') as number[]
        if (!values.length) throw badRequest(`Invalid values: ${filter.field}`)
        existsQuery = db
          .select({ one: sql`1` })
          .from(contentNumberData)
          .where(and(...baseConditions, inArray(contentNumberData.value, values)))
      } else if (op === 'range') {
        const min = filter.min != null ? coerceSearchValue({ kind } as any, filter.min) : null
        const max = filter.max != null ? coerceSearchValue({ kind } as any, filter.max) : null
        if (min == null && max == null) throw badRequest(`Range requires min or max: ${filter.field}`)
        const rangeParts = [] as any[]
        if (min != null) rangeParts.push(gte(contentNumberData.value, min as number))
        if (max != null) rangeParts.push(lte(contentNumberData.value, max as number))
        existsQuery = db
          .select({ one: sql`1` })
          .from(contentNumberData)
          .where(and(...baseConditions, ...rangeParts))
      }
      if (!existsQuery) throw badRequest(`Unsupported filter: ${filter.field}`)
      whereParts.push(exists(existsQuery))
      continue
    }

    if (tableKind === 'date') {
      const baseConditions = [
        eq(contentDateData.contentId, contentTable.id),
        eq(contentDateData.fieldId, config.fieldId)
      ]

      if (op === 'exact') {
        const value = coerceSearchValue({ kind } as any, filter.value)
        if (value == null) throw badRequest(`Invalid value: ${filter.field}`)
        existsQuery = db
          .select({ one: sql`1` })
          .from(contentDateData)
          .where(and(...baseConditions, eq(contentDateData.value, value as Date)))
      } else if (op === 'range') {
        const min = filter.min != null ? coerceSearchValue({ kind } as any, filter.min) : null
        const max = filter.max != null ? coerceSearchValue({ kind } as any, filter.max) : null
        if (min == null && max == null) throw badRequest(`Range requires min or max: ${filter.field}`)
        const rangeParts = [] as any[]
        if (min != null) rangeParts.push(gte(contentDateData.value, min as Date))
        if (max != null) rangeParts.push(lte(contentDateData.value, max as Date))
        existsQuery = db
          .select({ one: sql`1` })
          .from(contentDateData)
          .where(and(...baseConditions, ...rangeParts))
      } else if (op === 'exact_set') {
        const values = ensureArray(filter.values ?? filter.value)
          .map(v => coerceSearchValue({ kind } as any, v))
          .filter(v => v instanceof Date) as Date[]
        if (!values.length) throw badRequest(`Invalid values: ${filter.field}`)
        existsQuery = db
          .select({ one: sql`1` })
          .from(contentDateData)
          .where(and(...baseConditions, inArray(contentDateData.value, values)))
      }
      if (!existsQuery) throw badRequest(`Unsupported filter: ${filter.field}`)
      whereParts.push(exists(existsQuery))
      continue
    }
  }

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
    .where(and(...whereParts))
    .limit(limit)

  let query = base

  if (sortKey) {
    const config = fieldByKey.get(sortKey)
    if (!config) throw badRequest(`Unknown sort field: ${sortKey}`)
    if (!config.sortable) throw badRequest(`Field not sortable: ${sortKey}`)

    const tableKind = searchTableForKind(config.kind as any)
    if (!tableKind) throw badRequest(`Unsupported sort field: ${sortKey}`)

    if (tableKind === 'string') {
      const sortExpr = sql`(select ${contentStringData.value} from ${contentStringData} where ${contentStringData.contentId} = ${contentTable.id} and ${contentStringData.fieldId} = ${config.fieldId})`
      query = query.orderBy(sortDir === 'desc' ? desc(sortExpr) : asc(sortExpr), desc(contentTable.updatedAt))
    } else if (tableKind === 'number') {
      const sortExpr = sql`(select ${contentNumberData.value} from ${contentNumberData} where ${contentNumberData.contentId} = ${contentTable.id} and ${contentNumberData.fieldId} = ${config.fieldId})`
      query = query.orderBy(sortDir === 'desc' ? desc(sortExpr) : asc(sortExpr), desc(contentTable.updatedAt))
    } else if (tableKind === 'date') {
      const sortExpr = sql`(select ${contentDateData.value} from ${contentDateData} where ${contentDateData.contentId} = ${contentTable.id} and ${contentDateData.fieldId} = ${config.fieldId})`
      query = query.orderBy(sortDir === 'desc' ? desc(sortExpr) : asc(sortExpr), desc(contentTable.updatedAt))
    }
  } else {
    query = query.orderBy(desc(contentTable.updatedAt))
  }

  const items = await query
  const nextCursor = !sortKey && items.length
    ? String(new Date(items[items.length - 1]!.updatedAt).getTime())
    : null

  return { items, nextCursor }
})
