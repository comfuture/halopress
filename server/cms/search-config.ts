import { and, eq } from 'drizzle-orm'
import type { Db } from '../db/db'
import { searchConfig } from '../db/schema'
import type { SchemaRegistry } from './types'
import { normalizeSearchConfig } from './search-helpers'

export async function syncSearchConfig(args: {
  db: Db
  schemaKey: string
  registry: SchemaRegistry
}) {
  const { db, schemaKey, registry } = args
  const desiredKeys = new Set<string>()

  for (const field of registry.fields) {
    const config = normalizeSearchConfig(field)
    desiredKeys.add(field.key)
    await db
      .insert(searchConfig)
      .values({
        schemaKey,
        fieldKey: field.key,
        kind: field.kind,
        searchMode: config.mode,
        filterable: config.filterable,
        sortable: config.sortable
      })
      .onConflictDoUpdate({
        target: [searchConfig.schemaKey, searchConfig.fieldKey],
        set: {
          kind: field.kind,
          searchMode: config.mode,
          filterable: config.filterable,
          sortable: config.sortable
        }
      })
  }

  const existing = await db
    .select({ fieldKey: searchConfig.fieldKey })
    .from(searchConfig)
    .where(eq(searchConfig.schemaKey, schemaKey))

  for (const row of existing) {
    if (desiredKeys.has(row.fieldKey)) continue
    await db
      .delete(searchConfig)
      .where(and(eq(searchConfig.schemaKey, schemaKey), eq(searchConfig.fieldKey, row.fieldKey)))
  }
}
