import { and, eq } from 'drizzle-orm'
import type { Db } from '../db/db'
import { content as contentTable, contentSearchConfig, contentSearchData } from '../db/schema'
import type { FieldKind, SearchConfig, SchemaRegistry } from './types'
import { Node, generateHTML, generateText, mergeAttributes } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import HorizontalRule from '@tiptap/extension-horizontal-rule'
import Image from '@tiptap/extension-image'
import Mention from '@tiptap/extension-mention'

type SearchMode = NonNullable<SearchConfig['mode']>
type SearchDataType = 'text' | 'integer' | 'float' | 'date'

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

type NormalizedSearchConfig = {
  mode: SearchMode
  filterable: boolean
  sortable: boolean
}

const SEARCH_MODES_BY_KIND: Record<FieldKind, SearchMode[]> = {
  string: ['off', 'exact', 'exact_set'],
  text: ['off', 'exact', 'exact_set'],
  richtext: ['off', 'exact', 'exact_set'],
  url: ['off', 'exact', 'exact_set'],
  enum: ['off', 'exact', 'exact_set'],
  boolean: ['off', 'exact', 'exact_set'],
  number: ['off', 'exact', 'range'],
  integer: ['off', 'exact', 'range'],
  date: ['off', 'exact', 'range'],
  datetime: ['off', 'exact', 'range'],
  reference: ['off'],
  asset: ['off']
}

const FILTERABLE_KINDS = new Set<FieldKind>([
  'string',
  'text',
  'richtext',
  'url',
  'enum',
  'boolean',
  'number',
  'integer',
  'date',
  'datetime'
])

const SORTABLE_KINDS = new Set<FieldKind>([
  'string',
  'url',
  'enum',
  'boolean',
  'number',
  'integer',
  'date',
  'datetime'
])

const ServerImageUpload = Node.create({
  name: 'imageUpload',
  group: 'block',
  atom: true,
  draggable: false,
  parseHTML() {
    return [{ tag: 'div[data-type="image-upload"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'image-upload' })]
  }
})

const richtextExtensions = [
  StarterKit.configure({
    horizontalRule: false,
    heading: { levels: [1, 2, 3, 4] },
    link: { openOnClick: false }
  }),
  HorizontalRule,
  Image,
  Mention,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  ServerImageUpload
]

export function searchDataTypeForKind(kind: FieldKind): SearchDataType | null {
  if (kind === 'number') return 'float'
  if (kind === 'integer' || kind === 'boolean') return 'integer'
  if (kind === 'date' || kind === 'datetime') return 'date'
  if (kind === 'string' || kind === 'text' || kind === 'url' || kind === 'enum' || kind === 'richtext') return 'text'
  return null
}

function normalizeSearchMode(kind: FieldKind, mode?: SearchMode): SearchMode {
  const allowed = SEARCH_MODES_BY_KIND[kind] ?? ['off']
  if (mode && allowed.includes(mode)) return mode
  return 'off'
}

export function normalizeSearchConfig(field: SchemaRegistry['fields'][number]): NormalizedSearchConfig {
  const mode = normalizeSearchMode(field.kind, field.search?.mode)
  const filterable = FILTERABLE_KINDS.has(field.kind) && !!field.search?.filterable && mode !== 'off'
  const sortable = SORTABLE_KINDS.has(field.kind) && !!field.search?.sortable && mode !== 'off'
  return { mode, filterable, sortable }
}

export function isSearchEnabled(config: NormalizedSearchConfig) {
  return config.mode !== 'off' || config.filterable || config.sortable
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
  if (!Number.isFinite(num)) return null
  return Math.trunc(num)
}

function toDateValueMs(value: unknown): number | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getTime()
  if (typeof value === 'number') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date.getTime()
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const date = new Date(trimmed)
    return Number.isNaN(date.getTime()) ? null : date.getTime()
  }
  return null
}

function toEnumValue(value: unknown, options: Array<{ value: string }> | undefined): string | null {
  const candidate = toStringValue(value)
  if (!candidate) return null
  const allowed = new Set((options ?? []).map(v => v.value))
  if (!allowed.size) return candidate
  return allowed.has(candidate) ? candidate : null
}

function toRichtextHtml(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'string') return value
  if (typeof value !== 'object') return null
  try {
    return generateHTML(value as any, richtextExtensions)
  } catch {
    try {
      const text = generateText(value as any, richtextExtensions)
      if (typeof text === 'string') return text
    } catch {
      // ignore
    }
    const fallback = extractPlainText(value)
    return fallback
  }
}

function extractPlainText(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value.map(extractPlainText).filter(Boolean).join(' ')
  }
  if (typeof value === 'object') {
    const node = value as Record<string, unknown>
    const parts: string[] = []
    if (typeof node.text === 'string') parts.push(node.text)
    const content = node.content
    if (Array.isArray(content)) parts.push(content.map(extractPlainText).filter(Boolean).join(' '))
    return parts.filter(Boolean).join(' ')
  }
  return ''
}

export function coerceSearchValue(field: SchemaRegistry['fields'][number], value: unknown) {
  switch (field.kind) {
    case 'string':
    case 'text':
    case 'url':
      return toStringValue(value)
    case 'enum':
      return toEnumValue(value, field.enumValues)
    case 'richtext':
      return toRichtextHtml(value)
    case 'boolean':
      return toIntegerValue(value)
    case 'number':
      return toNumberValue(value)
    case 'integer':
      return toIntegerValue(value)
    case 'date':
    case 'datetime':
      return toDateValueMs(value)
    default:
      return null
  }
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
