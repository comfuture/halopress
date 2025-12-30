import { and, eq, inArray } from 'drizzle-orm'
import { readBody } from 'h3'

import { getDb } from '../../../db/db'
import { asset as assetTable, content as contentTable, contentRef, contentRefList } from '../../../db/schema'
import { deleteObject } from '../../../storage/assets'
import { requireAdmin } from '../../../utils/auth'
import { badRequest, notFound } from '../../../utils/http'
import { getActiveSchema } from '../../../cms/repo'
import { upsertContentItemSnapshot } from '../../../cms/content-items'
import { queueWidgetCacheInvalidation } from '../../../utils/widget-cache'

function replaceAssetRefs(value: unknown, fromId: string, toId?: string | null): { value: unknown; changed: boolean } {
  const rawUrl = `/assets/${fromId}/raw`
  const nextUrl = toId ? `/assets/${toId}/raw` : null

  if (typeof value === 'string') {
    let next = value
    let changed = false

    if (toId) {
      if (next === fromId) {
        next = toId
        changed = true
      }
      if (next.includes(rawUrl)) {
        const replaced = next.split(rawUrl).join(nextUrl ?? '')
        if (replaced !== next) {
          next = replaced
          changed = true
        }
      }
      return { value: next, changed }
    }

    if (next === fromId) {
      return { value: null, changed: true }
    }
    if (next.includes(rawUrl)) {
      const replaced = next.split(rawUrl).join('')
      if (replaced !== next) {
        next = replaced.trim()
        changed = true
      }
    }
    if (!next) {
      return { value: null, changed: true }
    }
    return { value: next, changed }
  }

  if (Array.isArray(value)) {
    let changed = false
    const nextArray: unknown[] = []
    for (let i = 0; i < value.length; i++) {
      const result = replaceAssetRefs(value[i], fromId, toId)
      if (result.changed) {
        changed = true
      }
      if (result.value !== null && result.value !== undefined && result.value !== '') {
        nextArray.push(result.value)
      } else if (!result.changed) {
        nextArray.push(result.value)
      }
    }
    return { value: nextArray, changed }
  }

  if (value && typeof value === 'object') {
    let changed = false
    for (const key of Object.keys(value as Record<string, unknown>)) {
      const result = replaceAssetRefs((value as Record<string, unknown>)[key], fromId, toId)
      if (result.changed) {
        ;(value as Record<string, unknown>)[key] = result.value
        changed = true
      }
    }
    return { value, changed }
  }

  return { value, changed: false }
}

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const assetId = event.context.params?.assetId as string
  if (!assetId) throw badRequest('Missing assetId')

  const body = await readBody<{ replacementId?: string }>(event)
  const replacementId = body?.replacementId?.trim()
  const hasReplacement = typeof replacementId === 'string' && replacementId.length > 0
  if (replacementId === assetId) throw badRequest('Replacement asset must be different')

  const db = await getDb(event)

  const current = await db
    .select({ id: assetTable.id, objectKey: assetTable.objectKey })
    .from(assetTable)
    .where(eq(assetTable.id, assetId))
    .limit(1)
  if (!current[0]) throw notFound('Asset not found')

  if (hasReplacement) {
    const replacement = await db
      .select({ id: assetTable.id })
      .from(assetTable)
      .where(eq(assetTable.id, replacementId))
      .limit(1)
    if (!replacement[0]) throw badRequest('Replacement asset not found')
  }

  const refs = await db
    .select({ contentId: contentRef.contentId })
    .from(contentRef)
    .where(and(eq(contentRef.targetKind, 'asset'), eq(contentRef.targetId, assetId)))

  const listRefs = await db
    .select({ contentId: contentRefList.ownerContentId })
    .from(contentRefList)
    .where(eq(contentRefList.assetId, assetId))

  const contentIds = Array.from(new Set([
    ...refs.map((ref: { contentId: string }) => ref.contentId),
    ...listRefs.map((ref: { contentId: string }) => ref.contentId)
  ]))

  if (hasReplacement) {
    await db
      .update(contentRef)
      .set({ targetId: replacementId })
      .where(and(eq(contentRef.targetKind, 'asset'), eq(contentRef.targetId, assetId)))

    await db
      .update(contentRefList)
      .set({ assetId: replacementId })
      .where(eq(contentRefList.assetId, assetId))
  } else {
    await db
      .delete(contentRef)
      .where(and(eq(contentRef.targetKind, 'asset'), eq(contentRef.targetId, assetId)))

    await db
      .delete(contentRefList)
      .where(eq(contentRefList.assetId, assetId))
  }

  const changedSchemas = new Set<string>()
  if (contentIds.length) {
    const contents = await db
      .select({
        id: contentTable.id,
        schemaKey: contentTable.schemaKey,
        schemaVersion: contentTable.schemaVersion,
        title: contentTable.title,
        status: contentTable.status,
        createdAt: contentTable.createdAt,
        updatedAt: contentTable.updatedAt,
        extraJson: contentTable.extraJson
      })
      .from(contentTable)
      .where(inArray(contentTable.id, contentIds))

    const registryCache = new Map<string, any>()
    for (const row of contents) {
      try {
        const extra = JSON.parse(row.extraJson)
        const result = replaceAssetRefs(extra, assetId, hasReplacement ? replacementId : null)
        if (result.changed) {
          changedSchemas.add(row.schemaKey)
          const nextUpdatedAt = new Date()
          await db
            .update(contentTable)
            .set({ extraJson: JSON.stringify(result.value), updatedAt: nextUpdatedAt })
            .where(eq(contentTable.id, row.id))

          if (!registryCache.has(row.schemaKey)) {
            const active = await getActiveSchema(db, row.schemaKey)
            registryCache.set(row.schemaKey, active?.registry ?? null)
          }

          await upsertContentItemSnapshot({
            db,
            registry: registryCache.get(row.schemaKey) ?? null,
            extra: result.value as Record<string, unknown>,
            contentId: row.id,
            schemaKey: row.schemaKey,
            schemaVersion: row.schemaVersion,
            title: row.title ?? null,
            status: row.status,
            createdAt: row.createdAt,
            updatedAt: nextUpdatedAt
          })
        }
      } catch {
        // ignore invalid JSON
      }
    }
  }

  for (const schemaKey of changedSchemas) {
    queueWidgetCacheInvalidation(event, `schema:${schemaKey}`)
  }

  await db.delete(assetTable).where(eq(assetTable.id, assetId))
  await deleteObject(event, current[0].objectKey)

  return { ok: true, replacedCount: contentIds.length }
})
