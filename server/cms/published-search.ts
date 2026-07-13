import { and, eq, inArray } from 'drizzle-orm'

import type { Db } from '../db/db'
import { contentListing as contentListingTable, schema as schemaTable } from '../db/schema'
import { conflict } from '../utils/http'
import { normalizeSearchConfig } from './search-helpers'
import type { SchemaRegistry } from './types'

export type PublishedSearchField = {
  fieldId: string
  fieldKey: string
  kind: string
  filterable?: boolean
  sortable?: boolean
}

export async function getPublishedSchemaFields(
  db: Db,
  schemaKey: string,
  status?: string | null
) {
  const conditions = [
    eq(contentListingTable.schemaKey, schemaKey),
    eq(contentListingTable.projectionScope, 'published')
  ]
  if (status) conditions.push(eq(contentListingTable.status, status))
  const versionRows = await db
    .selectDistinct({ version: contentListingTable.schemaVersion })
    .from(contentListingTable)
    .where(and(...conditions)) as Array<{ version: number }>
  const versions = [...new Set(versionRows.map(row => row.version))]
  if (!versions.length) return []

  const storedSchemas = await db
    .select({ version: schemaTable.version, registryJson: schemaTable.registryJson })
    .from(schemaTable)
    .where(and(
      eq(schemaTable.schemaKey, schemaKey),
      inArray(schemaTable.version, versions)
    )) as Array<{ version: number, registryJson: string | null }>
  if (storedSchemas.length !== versions.length) {
    throw conflict('Published search schema version is unavailable')
  }

  return storedSchemas.map((stored) => {
    if (!stored.registryJson) throw conflict('Published search schema version is unavailable')
    const registry = JSON.parse(stored.registryJson) as SchemaRegistry
    return { version: stored.version, fields: registry.fields }
  })
}

export function assertPublishedFieldCompatibility(args: {
  config: PublishedSearchField
  publishedSchemas: Awaited<ReturnType<typeof getPublishedSchemaFields>>
  capability?: 'filterable' | 'sortable'
}) {
  for (const stored of args.publishedSchemas) {
    const reusedKey = stored.fields.find(candidate => (
      candidate.key === args.config.fieldKey
      && candidate.fieldId !== args.config.fieldId
    ))
    if (reusedKey) {
      throw conflict(`Published search field spans incompatible schema versions: ${args.config.fieldKey}`)
    }
    const field = stored.fields.find(candidate => candidate.fieldId === args.config.fieldId)
    if (!field) continue
    const normalized = normalizeSearchConfig(field)
    if (field.kind !== args.config.kind || (args.capability && !normalized[args.capability])) {
      throw conflict(`Published search field spans incompatible schema versions: ${args.config.fieldKey}`)
    }
  }
}
