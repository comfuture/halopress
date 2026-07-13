import { and, eq } from 'drizzle-orm'
import type { Db } from '../db/db'
import { searchConfig } from '../db/schema'
import type { SchemaRegistry } from './types'
import { normalizeSearchConfig } from './search-helpers'
import { deleteContentSearchDataForFields } from './search-index'

export async function syncSearchConfig(args: {
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
      .insert(searchConfig)
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
        target: [searchConfig.schemaKey, searchConfig.fieldId],
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
    .select({ fieldId: searchConfig.fieldId })
    .from(searchConfig)
    .where(eq(searchConfig.schemaKey, schemaKey))

  const removedIds: string[] = []
  for (const row of existing) {
    if (desiredIds.has(row.fieldId)) continue
    removedIds.push(row.fieldId)
    await db
      .delete(searchConfig)
      .where(and(eq(searchConfig.schemaKey, schemaKey), eq(searchConfig.fieldId, row.fieldId)))
  }

  await deleteContentSearchDataForFields({ db, fieldIds: removedIds, projectionScope: 'working' })
}
