import { and, eq } from 'drizzle-orm'
import type { Db } from '../db/db'
import { contentRef, contentRefList } from '../db/schema'
import type { SchemaRegistry } from './types'

type TargetKind = 'content' | 'user' | 'asset'

export async function syncContentRefs(args: {
  db: Db
  contentId: string
  registry: SchemaRegistry
  extra: Record<string, unknown>
}) {
  const { db, contentId, registry, extra } = args

  const relations = registry.relations
  if (!relations.length) return

  // Clear existing refs for known fields.
  for (const rel of relations) {
    await db
      .delete(contentRef)
      .where(and(eq(contentRef.contentId, contentId), eq(contentRef.fieldPath, rel.fieldKey)))
  }
  for (const rel of relations) {
    await db
      .delete(contentRefList)
      .where(and(eq(contentRefList.ownerContentId, contentId), eq(contentRefList.fieldKey, rel.fieldKey)))
  }

  // Insert current refs (MVP: top-level fields only).
  for (const rel of relations) {
    const value = (extra as any)?.[rel.fieldKey]
    if (!value) continue

    const targetKind = rel.targetKind as TargetKind
    const targetSchemaKey = rel.targetSchemaKey ?? null

    const pushOne = async (targetId: string, position?: number) => {
      await db.insert(contentRef).values({
        contentId,
        fieldPath: rel.fieldKey,
        targetKind,
        targetSchemaKey,
        targetId
      })
      if (typeof position === 'number') {
        await db.insert(contentRefList).values({
          ownerContentId: contentId,
          fieldKey: rel.fieldKey,
          position,
          itemKind: targetKind,
          itemSchemaKey: targetSchemaKey,
          itemId: targetKind === 'asset' ? null : targetId,
          assetId: targetKind === 'asset' ? targetId : null,
          metaJson: null
        })
      }
    }

    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const v = value[i]
        if (typeof v === 'string' && v) await pushOne(v, i)
      }
    } else if (typeof value === 'string') {
      await pushOne(value)
    }
  }
}

