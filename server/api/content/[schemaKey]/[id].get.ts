import { and, asc, desc, eq, gt, lt, or } from 'drizzle-orm'
import { getQuery } from 'h3'

import { getDb } from '../../../db/db'
import { parseContentJson } from '../../../cms/content-json'
import { normalizeDeliveryStatus, resolveDeliveryPolicy } from '../../../utils/delivery-policy'
import { notFound } from '../../../utils/http'
import { content as contentTable, contentListing as contentListingTable } from '../../../db/schema'
import { buildContentListingSnapshot } from '../../../cms/content-listing'
import { getActiveSchema } from '../../../cms/repo'

export default defineEventHandler(async (event) => {
  const schemaKey = event.context.params?.schemaKey as string
  const id = event.context.params?.id as string
  const q = getQuery(event)
  const includeSurroundings = ['1', 'true'].includes(String(q.surroundings ?? q.includeSurroundings ?? ''))
  const order = q.order === 'asc' ? 'asc' : 'desc'

  const policy = await resolveDeliveryPolicy(event, schemaKey, { requestedStatus: q.status })
  const db = await getDb(event)
  const row = await db
    .select()
    .from(contentTable)
    .where(and(eq(contentTable.schemaKey, schemaKey), eq(contentTable.id, id)))
    .get()

  if (!row) throw notFound('Content not found')

  if (row.status !== 'published' && policy.isPublic) {
    throw notFound('Content not found')
  }

  const content = parseContentJson(row.contentJson)
  let item = await db
    .select({
      id: contentListingTable.contentId,
      schemaKey: contentListingTable.schemaKey,
      schemaVersion: contentListingTable.schemaVersion,
      title: contentListingTable.title,
      description: contentListingTable.description,
      image: contentListingTable.image,
      status: contentListingTable.status,
      createdAt: contentListingTable.createdAt,
      updatedAt: contentListingTable.updatedAt
    })
    .from(contentListingTable)
    .where(eq(contentListingTable.contentId, id))
    .get()

  if (!item) {
    const active = await getActiveSchema(db, schemaKey)
    item = buildContentListingSnapshot({
      registry: active?.registry ?? null,
      content,
      contentId: row.id,
      schemaKey: row.schemaKey,
      schemaVersion: row.schemaVersion,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    })
  }

  let surroundings: { prev: any; next: any } | undefined
  if (includeSurroundings) {
    const status = normalizeDeliveryStatus({
      roleKey: policy.permission.roleKey,
      requestedStatus: q.status,
      defaultStatus: row.status
    })
    const baseUpdatedAt = item.updatedAt
    const baseId = item.contentId ?? item.id ?? row.id
    const whereParts = [
      eq(contentListingTable.schemaKey, schemaKey)
    ] as any[]
    if (status) {
      whereParts.push(eq(contentListingTable.status, status))
    }

    const prevCondition = order === 'asc'
      ? or(
          lt(contentListingTable.updatedAt, baseUpdatedAt),
          and(eq(contentListingTable.updatedAt, baseUpdatedAt), lt(contentListingTable.contentId, baseId))
        )
      : or(
          gt(contentListingTable.updatedAt, baseUpdatedAt),
          and(eq(contentListingTable.updatedAt, baseUpdatedAt), gt(contentListingTable.contentId, baseId))
        )

    const nextCondition = order === 'asc'
      ? or(
          gt(contentListingTable.updatedAt, baseUpdatedAt),
          and(eq(contentListingTable.updatedAt, baseUpdatedAt), gt(contentListingTable.contentId, baseId))
        )
      : or(
          lt(contentListingTable.updatedAt, baseUpdatedAt),
          and(eq(contentListingTable.updatedAt, baseUpdatedAt), lt(contentListingTable.contentId, baseId))
        )

    const prev = await db
      .select({
        id: contentListingTable.contentId,
        schemaKey: contentListingTable.schemaKey,
        schemaVersion: contentListingTable.schemaVersion,
        title: contentListingTable.title,
        description: contentListingTable.description,
        image: contentListingTable.image,
        status: contentListingTable.status,
        createdAt: contentListingTable.createdAt,
        updatedAt: contentListingTable.updatedAt
      })
      .from(contentListingTable)
      .where(and(...whereParts, prevCondition))
      .orderBy(
        order === 'asc' ? desc(contentListingTable.updatedAt) : asc(contentListingTable.updatedAt),
        order === 'asc' ? desc(contentListingTable.contentId) : asc(contentListingTable.contentId)
      )
      .limit(1)

    const next = await db
      .select({
        id: contentListingTable.contentId,
        schemaKey: contentListingTable.schemaKey,
        schemaVersion: contentListingTable.schemaVersion,
        title: contentListingTable.title,
        description: contentListingTable.description,
        image: contentListingTable.image,
        status: contentListingTable.status,
        createdAt: contentListingTable.createdAt,
        updatedAt: contentListingTable.updatedAt
      })
      .from(contentListingTable)
      .where(and(...whereParts, nextCondition))
      .orderBy(
        order === 'asc' ? asc(contentListingTable.updatedAt) : desc(contentListingTable.updatedAt),
        order === 'asc' ? asc(contentListingTable.contentId) : desc(contentListingTable.contentId)
      )
      .limit(1)

    surroundings = { prev: prev[0] ?? null, next: next[0] ?? null }
  }

  const response = {
    id: row.id,
    schemaKey: row.schemaKey,
    schemaVersion: row.schemaVersion,
    title: item.title ?? null,
    status: row.status,
    description: item.description ?? null,
    image: item.image ?? null,
    content,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
  return includeSurroundings ? { ...response, surroundings } : response
})
