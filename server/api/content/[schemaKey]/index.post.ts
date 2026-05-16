import { readBody } from 'h3'

import { getDb } from '../../../db/db'
import { getAuthSession } from '../../../utils/auth'
import { badRequest, notFound } from '../../../utils/http'
import { newId } from '../../../utils/ids'
import { content as contentTable } from '../../../db/schema'
import { getActiveSchema } from '../../../cms/repo'
import { syncContentRefs } from '../../../cms/ref-sync'
import { upsertContentListingSnapshot } from '../../../cms/content-listing'
import { upsertContentSearchData } from '../../../cms/search-index'
import { validateContentJson } from '../../../cms/content-validation'
import { replaceBase64ImagesInContent } from '../../../utils/asset-data-url'
import { queueWidgetCacheInvalidation } from '../../../utils/widget-cache'
import { requireSchemaPermission } from '../../../utils/schema-permission'

export default defineEventHandler(async (event) => {
  const schemaKey = event.context.params?.schemaKey as string
  await requireSchemaPermission(event, schemaKey, 'write')
  const session = await getAuthSession(event)
  const actorId = (session?.user as any)?.id ?? null
  const body = await readBody<{ status?: string; content?: Record<string, unknown> }>(event)

  const db = await getDb(event)
  const active = await getActiveSchema(db, schemaKey)
  if (!active?.registry) throw notFound('Active schema not found')
  const registry = active.registry

  const id = newId()
  const now = new Date()
  const status = body?.status || 'draft'
  const contentInput = body?.content ?? {}
  if (typeof contentInput !== 'object' || Array.isArray(contentInput) || !contentInput) throw badRequest('Invalid content')
  const content = validateContentJson(active.jsonSchema, contentInput)

  await db.transaction(async (tx: any) => {
    await replaceBase64ImagesInContent({ event, db: tx, createdBy: actorId, content })

    await tx.insert(contentTable).values({
      id,
      schemaKey,
      schemaVersion: active.version,
      status,
      contentJson: JSON.stringify(content),
      createdBy: actorId,
      createdAt: now,
      updatedAt: now
    })

    await syncContentRefs({ db: tx, contentId: id, registry, content })
    await upsertContentListingSnapshot({
      db: tx,
      registry,
      content,
      contentId: id,
      schemaKey,
      schemaVersion: active.version,
      status,
      createdAt: now,
      updatedAt: now
    })
    await upsertContentSearchData({
      db: tx,
      contentId: id,
      registry,
      content
    })
  })

  queueWidgetCacheInvalidation(event, `schema:${schemaKey}`)

  return { ok: true, id }
})
