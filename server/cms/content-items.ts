import { eq } from 'drizzle-orm'
import type { Db } from '../db/db'
import { content as contentTable, contentItems } from '../db/schema'
import type { SchemaRegistry } from './types'
import { getActiveSchema } from './repo'
import { buildListingProjection } from './listing'

export function buildContentItemSnapshot(args: {
  registry: SchemaRegistry | null
  extra: Record<string, unknown>
  contentId: string
  schemaKey: string
  schemaVersion: number
  title: string | null
  status: string
  createdAt: Date
  updatedAt: Date
}) {
  const { registry, extra, contentId, schemaKey, schemaVersion, title, status, createdAt, updatedAt } = args
  const listing = buildListingProjection({ registry, content: extra })

  return {
    contentId,
    schemaKey,
    schemaVersion,
    title: title ?? listing.title,
    description: listing.description,
    image: listing.image,
    status,
    createdAt,
    updatedAt
  }
}

export async function upsertContentItemSnapshot(args: {
  db: Db
  registry: SchemaRegistry | null
  extra: Record<string, unknown>
  contentId: string
  schemaKey: string
  schemaVersion: number
  title: string | null
  status: string
  createdAt: Date
  updatedAt: Date
}) {
  const snapshot = buildContentItemSnapshot(args)
  await args.db
    .insert(contentItems)
    .values(snapshot)
    .onConflictDoUpdate({
      target: contentItems.contentId,
      set: {
        schemaKey: snapshot.schemaKey,
        schemaVersion: snapshot.schemaVersion,
        title: snapshot.title,
        description: snapshot.description,
        image: snapshot.image,
        status: snapshot.status,
        createdAt: snapshot.createdAt,
        updatedAt: snapshot.updatedAt
      }
    })
}

export async function syncContentItems(args: {
  db: Db
  schemaKey?: string
  onlyMissing?: boolean
}) {
  const { db, schemaKey, onlyMissing = true } = args
  let existingIds = new Set<string>()

  if (onlyMissing) {
    const existingRows = await (schemaKey
      ? db.select({ contentId: contentItems.contentId }).from(contentItems).where(eq(contentItems.schemaKey, schemaKey))
      : db.select({ contentId: contentItems.contentId }).from(contentItems))
    existingIds = new Set(existingRows.map((row: any) => row.contentId as string))
  }

  const rows = await (schemaKey
    ? db
      .select({
        id: contentTable.id,
        schemaKey: contentTable.schemaKey,
        schemaVersion: contentTable.schemaVersion,
        title: contentTable.title,
        status: contentTable.status,
        extraJson: contentTable.extraJson,
        createdAt: contentTable.createdAt,
        updatedAt: contentTable.updatedAt
      })
      .from(contentTable)
      .where(eq(contentTable.schemaKey, schemaKey))
    : db
      .select({
        id: contentTable.id,
        schemaKey: contentTable.schemaKey,
        schemaVersion: contentTable.schemaVersion,
        title: contentTable.title,
        status: contentTable.status,
        extraJson: contentTable.extraJson,
        createdAt: contentTable.createdAt,
        updatedAt: contentTable.updatedAt
      })
      .from(contentTable))

  const registryCache = new Map<string, SchemaRegistry | null>()
  let updated = 0
  let skipped = 0
  let failed = 0

  for (const row of rows) {
    if (onlyMissing && existingIds.has(row.id)) {
      skipped += 1
      continue
    }

    let extra: Record<string, unknown> = {}
    try {
      const parsed = JSON.parse(row.extraJson)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        extra = parsed as Record<string, unknown>
      }
    } catch {
      extra = {}
    }

    if (!registryCache.has(row.schemaKey)) {
      const active = await getActiveSchema(db, row.schemaKey)
      registryCache.set(row.schemaKey, active?.registry ?? null)
    }

    const createdAt = row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt)
    const updatedAt = row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt)

    try {
      await upsertContentItemSnapshot({
        db,
        registry: registryCache.get(row.schemaKey) ?? null,
        extra,
        contentId: row.id,
        schemaKey: row.schemaKey,
        schemaVersion: row.schemaVersion,
        title: row.title ?? null,
        status: row.status,
        createdAt,
        updatedAt
      })
      updated += 1
    } catch {
      failed += 1
    }
  }

  return { total: rows.length, updated, skipped, failed }
}
