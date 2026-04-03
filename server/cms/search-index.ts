import { and, eq } from 'drizzle-orm'
import type { Db } from '../db/db'
import { content as contentTable, contentSearchConfig, contentSearchData } from '../db/schema'
import type { FieldKind, SchemaRegistry } from './types'
import {
  coerceSearchValue,
  isSearchEnabled,
  normalizeSearchConfig,
  searchDataTypeForKind,
  type SearchDataType
} from './search-helpers'

type ContentSearchBase = {
  title?: string | null
  createdAt?: Date | null
  updatedAt?: Date | null
}

const SYSTEM_FIELD_KEYS = new Set(['title', 'created_at', 'updated_at'])

function isSystemField(field: SchemaRegistry['fields'][number]) {
  return Boolean((field as any).system) || SYSTEM_FIELD_KEYS.has(field.key)
}

function getSystemFieldValue(fieldKey: string, content?: ContentSearchBase) {
  if (!content) return null
  if (fieldKey === 'title') return content.title ?? null
  if (fieldKey === 'created_at') return content.createdAt ?? null
  if (fieldKey === 'updated_at') return content.updatedAt ?? null
  return null
}

async function deleteSearchValueByField(db: Db, fieldId: string) {
  await db.delete(contentSearchData).where(eq(contentSearchData.fieldId, fieldId))
}

async function deleteSearchValueByContent(db: Db, contentId: string, fieldId: string) {
  await db
    .delete(contentSearchData)
    .where(and(eq(contentSearchData.contentId, contentId), eq(contentSearchData.fieldId, fieldId)))
}

async function upsertSearchValue(
  db: Db,
  contentId: string,
  fieldId: string,
  dataType: SearchDataType,
  value: string | number
) {
  await db
    .insert(contentSearchData)
    .values({
      contentId,
      fieldId,
      dataType,
      text: dataType === 'text' ? (value as string) : null,
      value: dataType === 'text' ? null : (value as number)
    })
    .onConflictDoUpdate({
      target: [contentSearchData.contentId, contentSearchData.fieldId],
      set: {
        dataType,
        text: dataType === 'text' ? (value as string) : null,
        value: dataType === 'text' ? null : (value as number)
      }
    })
}

export async function upsertContentSearchData(args: {
  db: Db
  contentId: string
  registry: SchemaRegistry
  extra: Record<string, unknown>
  content?: ContentSearchBase
  onlyFieldIds?: string[]
}) {
  const { db, contentId, registry, extra, content, onlyFieldIds } = args
  const onlySet = onlyFieldIds ? new Set(onlyFieldIds) : null

  for (const field of registry.fields) {
    if (onlySet && !onlySet.has(field.fieldId)) continue
    const config = normalizeSearchConfig(field)
    if (!isSearchEnabled(config)) continue
    const dataType = searchDataTypeForKind(field.kind)
    if (!dataType) continue

    const rawValue = isSystemField(field) ? getSystemFieldValue(field.key, content) : extra[field.key]
    const coerced = coerceSearchValue(field, rawValue)
    if (coerced == null || (typeof coerced === 'string' && coerced.trim() === '')) {
      await deleteSearchValueByContent(db, contentId, field.fieldId)
      continue
    }

    await upsertSearchValue(db, contentId, field.fieldId, dataType, coerced as any)
  }
}

export async function syncContentSearchConfig(args: {
  db: Db
  schemaKey: string
  registry: SchemaRegistry
}) {
  const { db, schemaKey, registry } = args
  const desiredIds = new Set<string>()

  for (const field of registry.fields) {
    const config = normalizeSearchConfig(field)
    desiredIds.add(field.fieldId)
    await db
      .insert(contentSearchConfig)
      .values({
        schemaKey,
        fieldId: field.fieldId,
        fieldKey: field.key,
        kind: field.kind,
        searchMode: config.mode,
        filterable: config.filterable,
        sortable: config.sortable
      })
      .onConflictDoUpdate({
        target: [contentSearchConfig.schemaKey, contentSearchConfig.fieldId],
        set: {
          fieldKey: field.key,
          kind: field.kind,
          searchMode: config.mode,
          filterable: config.filterable,
          sortable: config.sortable
        }
      })
  }

  const existing = await db
    .select({ fieldId: contentSearchConfig.fieldId })
    .from(contentSearchConfig)
    .where(eq(contentSearchConfig.schemaKey, schemaKey))

  for (const row of existing) {
    if (desiredIds.has(row.fieldId)) continue
    await db
      .delete(contentSearchConfig)
      .where(and(eq(contentSearchConfig.schemaKey, schemaKey), eq(contentSearchConfig.fieldId, row.fieldId)))
  }
}

export async function syncSearchIndexForSchema(args: {
  db: Db
  schemaKey: string
  previousRegistry: SchemaRegistry | null
  nextRegistry: SchemaRegistry
}) {
  const { db, schemaKey, previousRegistry, nextRegistry } = args
  const prevMap = new Map<string, { enabled: boolean; dataType: SearchDataType | null; kind: FieldKind }>()
  if (previousRegistry) {
    for (const field of previousRegistry.fields) {
      const config = normalizeSearchConfig(field)
      prevMap.set(field.fieldId, {
        enabled: isSearchEnabled(config),
        dataType: searchDataTypeForKind(field.kind),
        kind: field.kind
      })
    }
  }

  const nextMap = new Map<string, { enabled: boolean; dataType: SearchDataType | null; kind: FieldKind }>()
  for (const field of nextRegistry.fields) {
    const config = normalizeSearchConfig(field)
    nextMap.set(field.fieldId, {
      enabled: isSearchEnabled(config),
      dataType: searchDataTypeForKind(field.kind),
      kind: field.kind
    })
  }

  const fieldsToDisable: string[] = []
  const fieldsToEnable: string[] = []

  for (const [fieldId, prev] of prevMap.entries()) {
    const next = nextMap.get(fieldId)
    const nextEnabled = next?.enabled ?? false
    const dataTypeChanged = !!next && prev.dataType !== next.dataType
    if (prev.enabled && (!nextEnabled || dataTypeChanged)) fieldsToDisable.push(fieldId)
  }

  for (const field of nextRegistry.fields) {
    const prev = prevMap.get(field.fieldId)
    const next = nextMap.get(field.fieldId)
    const prevEnabled = prev?.enabled ?? false
    const nextEnabled = next?.enabled ?? false
    const dataTypeChanged = !!prev && !!next && prev.dataType !== next.dataType
    const kindChanged = !!prev && !!next && prev.kind !== next.kind
    if (nextEnabled && (!prevEnabled || dataTypeChanged || kindChanged)) fieldsToEnable.push(field.fieldId)
  }

  for (const fieldId of fieldsToDisable) {
    await deleteSearchValueByField(db, fieldId)
  }

  if (!fieldsToEnable.length) return { indexed: 0 }

  const rows = await db
    .select({
      id: contentTable.id,
      title: contentTable.title,
      createdAt: contentTable.createdAt,
      updatedAt: contentTable.updatedAt,
      extraJson: contentTable.extraJson
    })
    .from(contentTable)
    .where(eq(contentTable.schemaKey, schemaKey))

  let indexed = 0
  for (const row of rows) {
    const extra = JSON.parse(row.extraJson || '{}') as Record<string, unknown>
    await upsertContentSearchData({
      db,
      contentId: row.id,
      registry: nextRegistry,
      extra,
      content: {
        title: row.title,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
      },
      onlyFieldIds: fieldsToEnable
    })
    indexed += 1
  }

  return { indexed }
}
