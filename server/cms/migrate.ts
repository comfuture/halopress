import { eq } from 'drizzle-orm'
import type { Db } from '../db/db'
import { content as contentTable } from '../db/schema'
import type { FieldKind, FieldNode, SchemaAst, SchemaRegistry } from './types'
import { syncContentRefs } from './ref-sync'
import { upsertContentItemSnapshot } from './content-items'

export type KindChange = {
  fieldId: string
  fromKey: string
  toKey: string
  fromKind: FieldKind
  toKind: FieldKind
  fromRel?: FieldNode['rel']
  toRel?: FieldNode['rel']
  toField: FieldNode
}

export function getKindChanges(fromAst: SchemaAst | null, toAst: SchemaAst): KindChange[] {
  if (!fromAst) return []
  const prevById = new Map(fromAst.fields.map(field => [field.id, field]))
  const changes: KindChange[] = []

  for (const field of toAst.fields) {
    const prev = prevById.get(field.id)
    if (!prev) continue
    const prevCardinality = prev.rel?.cardinality ?? 'one'
    const nextCardinality = field.rel?.cardinality ?? 'one'
    const refCardinalityChanged = prev.kind === 'reference' && field.kind === 'reference' && prevCardinality !== nextCardinality
    if (prev.kind !== field.kind || refCardinalityChanged) {
      changes.push({
        fieldId: field.id,
        fromKey: prev.key,
        toKey: field.key,
        fromKind: prev.kind,
        toKind: field.kind,
        fromRel: prev.rel,
        toRel: field.rel,
        toField: field
      })
    }
  }

  return changes
}

function toStringValue(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return null
}

function toNumberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const num = Number(trimmed)
    return Number.isFinite(num) ? num : null
  }
  return null
}

function toIntegerValue(value: unknown): number | null {
  const num = toNumberValue(value)
  if (num == null) return null
  return Math.trunc(num)
}

function toBooleanValue(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (!normalized) return null
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true
    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false
  }
  return null
}

function toDateString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
    const date = new Date(trimmed)
    if (Number.isNaN(date.getTime())) return null
    return date.toISOString().slice(0, 10)
  }
  if (typeof value === 'number') {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return null
    return date.toISOString().slice(0, 10)
  }
  return null
}

function toDateTimeString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const date = new Date(trimmed)
    if (Number.isNaN(date.getTime())) return null
    return date.toISOString()
  }
  if (typeof value === 'number') {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return null
    return date.toISOString()
  }
  return null
}

function normalizeId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  return value ? value : null
}

function toReferenceValue(value: unknown, cardinality: 'one' | 'many') {
  if (cardinality === 'many') {
    if (Array.isArray(value)) return value.map(normalizeId).filter(Boolean)
    const one = normalizeId(value)
    return one ? [one] : []
  }
  if (Array.isArray(value)) {
    const first = value.map(normalizeId).find(Boolean) ?? null
    return first
  }
  return normalizeId(value)
}

function coerceValue(value: unknown, field: FieldNode): unknown {
  switch (field.kind) {
    case 'string':
    case 'text':
    case 'url':
      return toStringValue(value)
    case 'number':
      return toNumberValue(value)
    case 'integer':
      return toIntegerValue(value)
    case 'boolean':
      return toBooleanValue(value)
    case 'date':
      return toDateString(value)
    case 'datetime':
      return toDateTimeString(value)
    case 'enum': {
      const candidate = toStringValue(value)
      if (!candidate) return null
      const allowed = new Set((field.enumValues ?? []).map(v => v.value))
      return allowed.has(candidate) ? candidate : null
    }
    case 'richtext':
      if (typeof value === 'string' || Array.isArray(value) || (value && typeof value === 'object')) return value
      return null
    case 'reference':
      return toReferenceValue(value, field.rel?.cardinality ?? 'one')
    case 'asset':
      return toReferenceValue(value, 'one')
    default:
      return null
  }
}

function valuesEqual(a: unknown, b: unknown) {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  return JSON.stringify(a) === JSON.stringify(b)
}

export async function migrateSchemaContent(args: {
  db: Db
  schemaKey: string
  nextVersion: number
  registry: SchemaRegistry
  changes: KindChange[]
}) {
  const { db, schemaKey, nextVersion, registry, changes } = args
  if (!changes.length) return { updated: 0 }

  const rows = await db
    .select({
      id: contentTable.id,
      title: contentTable.title,
      status: contentTable.status,
      createdAt: contentTable.createdAt,
      extraJson: contentTable.extraJson
    })
    .from(contentTable)
    .where(eq(contentTable.schemaKey, schemaKey))

  let updated = 0
  for (const row of rows) {
    const extra = JSON.parse(row.extraJson || '{}') as Record<string, unknown>
    let mutated = false

    for (const change of changes) {
      const fromKey = change.fromKey
      const toKey = change.toKey
      let currentValue: unknown = extra[fromKey]
      if (currentValue === undefined && fromKey !== toKey) {
        currentValue = extra[toKey]
      }
      if (currentValue === undefined) continue

      const nextValue = coerceValue(currentValue, change.toField)

      if (nextValue == null || (Array.isArray(nextValue) && nextValue.length === 0)) {
        if (fromKey in extra) {
          delete extra[fromKey]
          mutated = true
        }
        if (toKey in extra) {
          delete extra[toKey]
          mutated = true
        }
        continue
      }

      if (fromKey !== toKey && fromKey in extra) {
        delete extra[fromKey]
        mutated = true
      }

      if (!valuesEqual(extra[toKey], nextValue)) {
        extra[toKey] = nextValue
        mutated = true
      }
    }

    const now = new Date()
    const updatePayload: Record<string, unknown> = {
      schemaVersion: nextVersion,
      updatedAt: now
    }
    if (mutated) updatePayload.extraJson = JSON.stringify(extra)

    await db
      .update(contentTable)
      .set(updatePayload)
      .where(eq(contentTable.id, row.id))

    await syncContentRefs({ db, contentId: row.id, registry, extra })
    await upsertContentItemSnapshot({
      db,
      registry,
      extra,
      contentId: row.id,
      schemaKey,
      schemaVersion: nextVersion,
      title: row.title ?? null,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: now
    })
    updated += 1
  }

  return { updated }
}
