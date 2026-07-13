import { and, eq } from 'drizzle-orm'
import type { H3Event } from 'h3'

import type { Db } from '../db/db'
import { content as contentTable, contentListing as contentListingTable, publicationRevision } from '../db/schema'
import { executeDbStatement, withDbTransaction } from '../db/transaction'
import { replaceBase64ImagesInContent } from '../utils/asset-data-url'
import { conflict, notFound } from '../utils/http'
import { newId } from '../utils/ids'
import { parseContentJson } from './content-json'
import { deleteContentProjections, syncContentProjections } from './content-projections'
import { getPublicationRevision, publicationMetadata, publicationRevisionValues } from './publication'
import { getSchemaVersion } from './repo'
import type { SchemaRegistry } from './types'

type ActiveContentSchema = {
  version: number
  registry: SchemaRegistry
}

function asDate(value: Date | number | string) {
  return value instanceof Date ? value : new Date(value)
}

export async function saveContentWorking(args: {
  event: H3Event
  db: Db
  existing: any
  schemaKey: string
  active: ActiveContentSchema
  content: Record<string, unknown>
  actorId: string | null
}) {
  const now = new Date()
  await withDbTransaction(args.event, args.db, async (tx: Db, statements) => {
    await replaceBase64ImagesInContent({
      event: args.event,
      db: tx,
      createdBy: args.actorId,
      content: args.content,
      statements
    })
    await executeDbStatement(tx.update(contentTable).set({
      status: 'draft',
      contentJson: JSON.stringify(args.content),
      schemaVersion: args.active.version,
      updatedAt: now
    }).where(eq(contentTable.id, args.existing.id)), statements)
    await syncContentProjections({
      db: tx,
      registry: args.active.registry,
      content: args.content,
      contentId: args.existing.id,
      schemaKey: args.schemaKey,
      schemaVersion: args.active.version,
      status: 'draft',
      createdAt: asDate(args.existing.createdAt),
      updatedAt: now,
      projectionScope: 'working',
      statements
    })
  })
  return publicationMetadata({ ...args.existing, status: 'draft' })
}

export async function publishContentWorking(args: {
  event: H3Event
  db: Db
  existing: any
  schemaKey: string
  active: ActiveContentSchema
  content: Record<string, unknown>
  actorId: string | null
}) {
  const now = new Date()
  const revisionId = newId()
  await withDbTransaction(args.event, args.db, async (tx: Db, statements) => {
    await replaceBase64ImagesInContent({
      event: args.event,
      db: tx,
      createdBy: args.actorId,
      content: args.content,
      statements
    })
    await executeDbStatement(tx.insert(publicationRevision).values(publicationRevisionValues({
      id: revisionId,
      documentKind: 'content',
      documentId: args.existing.id,
      schemaKey: args.schemaKey,
      schemaVersion: args.active.version,
      content: args.content,
      createdBy: args.actorId,
      createdAt: now
    })), statements)
    await executeDbStatement(tx.update(contentTable).set({
      status: 'published',
      contentJson: JSON.stringify(args.content),
      schemaVersion: args.active.version,
      publishedRevisionId: revisionId,
      firstPublishedAt: args.existing.firstPublishedAt ?? now,
      publishedAt: now,
      updatedAt: now
    }).where(eq(contentTable.id, args.existing.id)), statements)

    for (const projectionScope of ['working', 'published'] as const) {
      await syncContentProjections({
        db: tx,
        registry: args.active.registry,
        content: args.content,
        contentId: args.existing.id,
        schemaKey: args.schemaKey,
        schemaVersion: args.active.version,
        status: 'published',
        createdAt: asDate(args.existing.createdAt),
        updatedAt: now,
        projectionScope,
        statements
      })
    }
  })
  return publicationMetadata({
    ...args.existing,
    status: 'published',
    publishedRevisionId: revisionId,
    firstPublishedAt: args.existing.firstPublishedAt ?? now,
    publishedAt: now
  })
}

export async function discardContentWorking(args: {
  event: H3Event
  db: Db
  existing: any
  schemaKey: string
}) {
  const revision = await getPublicationRevision(
    args.db,
    'content',
    args.existing.id,
    args.existing.publishedRevisionId
  )
  if (!revision) throw conflict('No published revision to restore')
  const version = await getSchemaVersion(args.db, args.schemaKey, revision.schemaVersion)
  if (!version?.registry) throw notFound('Published schema not found')
  const content = parseContentJson(revision.contentJson)
  const now = new Date()

  await withDbTransaction(args.event, args.db, async (tx: Db, statements) => {
    await executeDbStatement(tx.update(contentTable).set({
      status: 'published',
      contentJson: revision.contentJson,
      schemaVersion: revision.schemaVersion,
      updatedAt: now
    }).where(eq(contentTable.id, args.existing.id)), statements)
    await syncContentProjections({
      db: tx,
      registry: version.registry!,
      content,
      contentId: args.existing.id,
      schemaKey: args.schemaKey,
      schemaVersion: revision.schemaVersion,
      status: 'published',
      createdAt: asDate(args.existing.createdAt),
      updatedAt: now,
      projectionScope: 'working',
      statements
    })
  })
  return publicationMetadata({ ...args.existing, status: 'published' })
}

export async function unpublishContent(args: {
  event: H3Event
  db: Db
  existing: any
}) {
  if (!args.existing.publishedRevisionId) throw conflict('Content is not published')
  const now = new Date()
  await withDbTransaction(args.event, args.db, async (tx: Db, statements) => {
    await executeDbStatement(tx.update(contentTable).set({
      status: 'draft',
      publishedRevisionId: null,
      publishedAt: null,
      updatedAt: now
    }).where(eq(contentTable.id, args.existing.id)), statements)
    await executeDbStatement(tx.update(contentListingTable).set({
      status: 'draft',
      updatedAt: now
    }).where(and(
      eq(contentListingTable.contentId, args.existing.id),
      eq(contentListingTable.projectionScope, 'working')
    )), statements)
    await deleteContentProjections({
      db: tx,
      contentId: args.existing.id,
      projectionScope: 'published',
      statements
    })
  })
  return publicationMetadata({
    ...args.existing,
    status: 'draft',
    publishedRevisionId: null,
    publishedAt: null
  })
}
