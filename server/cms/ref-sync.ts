import { and, eq } from 'drizzle-orm'
import type { Db } from '../db/db'
import { contentRef, contentRefList } from '../db/schema'
import { executeDbStatement } from '../db/transaction'
import type { DbStatement } from '../db/transaction'
import type { SchemaRegistry } from './types'

type TargetKind = 'content' | 'user' | 'asset'

export async function syncContentRefs(args: {
  db: Db
  contentId: string
  registry: SchemaRegistry
  content: Record<string, unknown>
  projectionScope?: 'working' | 'published'
  statements?: DbStatement[]
}) {
  const { db, contentId, registry, content, statements } = args
  const projectionScope = args.projectionScope ?? 'working'

  const relations = registry.relations
  await executeDbStatement(db
    .delete(contentRef)
    .where(and(eq(contentRef.contentId, contentId), eq(contentRef.projectionScope, projectionScope))), statements)
  await executeDbStatement(db
    .delete(contentRefList)
    .where(and(eq(contentRefList.ownerContentId, contentId), eq(contentRefList.projectionScope, projectionScope))), statements)

  // Insert current refs (MVP: top-level fields only).
  for (const rel of relations) {
    const value = (content as any)?.[rel.fieldKey]
    if (!value) continue

    const targetKind = rel.targetKind as TargetKind
    const targetSchemaKey = rel.targetSchemaKey ?? null
    const insertedSetIds = new Set<string>()

    const pushOne = async (targetId: string, position?: number, meta?: Record<string, unknown>) => {
      if (!insertedSetIds.has(targetId)) {
        await executeDbStatement(db.insert(contentRef).values({
          contentId,
          projectionScope,
          fieldPath: rel.fieldKey,
          targetKind,
          targetSchemaKey,
          targetId
        }), statements)
        insertedSetIds.add(targetId)
      }
      if (typeof position === 'number') {
        await executeDbStatement(db.insert(contentRefList).values({
          ownerContentId: contentId,
          projectionScope,
          fieldKey: rel.fieldKey,
          position,
          itemKind: targetKind,
          itemSchemaKey: targetSchemaKey,
          itemId: targetKind === 'asset' ? null : targetId,
          assetId: targetKind === 'asset' ? targetId : null,
          metaJson: meta && Object.keys(meta).length ? JSON.stringify(meta) : null
        }), statements)
      }
    }

    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const v = value[i]
        if (typeof v === 'string' && v) await pushOne(v, i)
        else if (v && typeof v === 'object' && typeof (v as any).assetId === 'string') {
          const { assetId, alt, caption } = v as { assetId: string; alt?: unknown; caption?: unknown }
          const meta = {
            ...(typeof alt === 'string' && alt ? { alt } : {}),
            ...(typeof caption === 'string' && caption ? { caption } : {})
          }
          await pushOne(assetId, i, meta)
        }
      }
    } else if (typeof value === 'string') {
      await pushOne(value)
    }
  }
}
