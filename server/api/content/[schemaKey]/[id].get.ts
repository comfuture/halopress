import { and, asc, desc, eq, gt, lt, or } from 'drizzle-orm'
import { getQuery } from 'h3'

import { getDb } from '../../../db/db'
import { notFound, unauthorized } from '../../../utils/http'
import { content as contentTable, contentItems as contentItemsTable } from '../../../db/schema'
import { buildContentItemSnapshot } from '../../../cms/content-items'
import { getActiveSchema } from '../../../cms/repo'
import { requireSchemaPermission } from '../../../utils/schema-permission'

export default defineEventHandler(async (event) => {
  const schemaKey = event.context.params?.schemaKey as string
  const id = event.context.params?.id as string
  const q = getQuery(event)
  const includeSurroundings = ['1', 'true'].includes(String(q.surroundings ?? q.includeSurroundings ?? ''))
  const order = q.order === 'asc' ? 'asc' : 'desc'

  const permission = await requireSchemaPermission(event, schemaKey, 'read')
  const db = await getDb(event)
  const row = await db
    .select()
    .from(contentTable)
    .where(and(eq(contentTable.schemaKey, schemaKey), eq(contentTable.id, id)))
    .get()

  if (!row) throw notFound('Content not found')

  if (row.status !== 'published' && permission.roleKey === 'anonymous') {
    throw unauthorized()
  }

  const extra = JSON.parse(row.extraJson)
  let item = await db
    .select({
      id: contentItemsTable.contentId,
      schemaKey: contentItemsTable.schemaKey,
      schemaVersion: contentItemsTable.schemaVersion,
      title: contentItemsTable.title,
      description: contentItemsTable.description,
      image: contentItemsTable.image,
      status: contentItemsTable.status,
      createdAt: contentItemsTable.createdAt,
      updatedAt: contentItemsTable.updatedAt
    })
    .from(contentItemsTable)
    .where(eq(contentItemsTable.contentId, id))
    .get()

  if (!item) {
    const active = await getActiveSchema(db, schemaKey)
    item = buildContentItemSnapshot({
      registry: active?.registry ?? null,
      extra,
      contentId: row.id,
      schemaKey: row.schemaKey,
      schemaVersion: row.schemaVersion,
      title: row.title,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    })
  }

  let surroundings: { prev: any; next: any } | undefined
  if (includeSurroundings) {
    const requestedStatus = typeof q.status === 'string' && q.status.length ? q.status : row.status
    let status = requestedStatus
    if (requestedStatus !== 'published') {
      if (permission.roleKey === 'anonymous') status = 'published'
    }
    const baseUpdatedAt = item.updatedAt
    const baseId = item.contentId ?? item.id ?? row.id
    const whereParts = [
      eq(contentItemsTable.schemaKey, schemaKey)
    ] as any[]
    if (status !== 'all') {
      whereParts.push(eq(contentItemsTable.status, status))
    }

    const prevCondition = order === 'asc'
      ? or(
          lt(contentItemsTable.updatedAt, baseUpdatedAt),
          and(eq(contentItemsTable.updatedAt, baseUpdatedAt), lt(contentItemsTable.contentId, baseId))
        )
      : or(
          gt(contentItemsTable.updatedAt, baseUpdatedAt),
          and(eq(contentItemsTable.updatedAt, baseUpdatedAt), gt(contentItemsTable.contentId, baseId))
        )

    const nextCondition = order === 'asc'
      ? or(
          gt(contentItemsTable.updatedAt, baseUpdatedAt),
          and(eq(contentItemsTable.updatedAt, baseUpdatedAt), gt(contentItemsTable.contentId, baseId))
        )
      : or(
          lt(contentItemsTable.updatedAt, baseUpdatedAt),
          and(eq(contentItemsTable.updatedAt, baseUpdatedAt), lt(contentItemsTable.contentId, baseId))
        )

    const prev = await db
      .select({
        id: contentItemsTable.contentId,
        schemaKey: contentItemsTable.schemaKey,
        schemaVersion: contentItemsTable.schemaVersion,
        title: contentItemsTable.title,
        description: contentItemsTable.description,
        image: contentItemsTable.image,
        status: contentItemsTable.status,
        createdAt: contentItemsTable.createdAt,
        updatedAt: contentItemsTable.updatedAt
      })
      .from(contentItemsTable)
      .where(and(...whereParts, prevCondition))
      .orderBy(
        order === 'asc' ? desc(contentItemsTable.updatedAt) : asc(contentItemsTable.updatedAt),
        order === 'asc' ? desc(contentItemsTable.contentId) : asc(contentItemsTable.contentId)
      )
      .limit(1)

    const next = await db
      .select({
        id: contentItemsTable.contentId,
        schemaKey: contentItemsTable.schemaKey,
        schemaVersion: contentItemsTable.schemaVersion,
        title: contentItemsTable.title,
        description: contentItemsTable.description,
        image: contentItemsTable.image,
        status: contentItemsTable.status,
        createdAt: contentItemsTable.createdAt,
        updatedAt: contentItemsTable.updatedAt
      })
      .from(contentItemsTable)
      .where(and(...whereParts, nextCondition))
      .orderBy(
        order === 'asc' ? asc(contentItemsTable.updatedAt) : desc(contentItemsTable.updatedAt),
        order === 'asc' ? asc(contentItemsTable.contentId) : desc(contentItemsTable.contentId)
      )
      .limit(1)

    surroundings = { prev: prev[0] ?? null, next: next[0] ?? null }
  }

  const response = {
    id: row.id,
    schemaKey: row.schemaKey,
    schemaVersion: row.schemaVersion,
    title: row.title,
    status: row.status,
    description: item.description ?? null,
    image: item.image ?? null,
    extra,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
  return includeSurroundings ? { ...response, surroundings } : response
})
