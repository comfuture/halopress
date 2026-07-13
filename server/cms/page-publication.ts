import { and, eq } from 'drizzle-orm'
import type { H3Event } from 'h3'

import type { Db } from '../db/db'
import { documentAssetRef, page as pageTable, publicationRevision } from '../db/schema'
import { executeDbStatement, withDbTransaction } from '../db/transaction'
import { conflict } from '../utils/http'
import { newId } from '../utils/ids'
import { syncDocumentAssetRefs } from './asset-refs'
import { getPublicationRevision, publicationMetadata, publicationRevisionValues } from './publication'

export async function savePageWorking(args: {
  event: H3Event
  db: Db
  existing: any
  title: string | null
  content: Record<string, unknown>
}) {
  const now = new Date()
  await withDbTransaction(args.event, args.db, async (tx: Db, statements) => {
    await executeDbStatement(tx.update(pageTable).set({
      title: args.title,
      status: 'draft',
      contentJson: JSON.stringify(args.content),
      updatedAt: now
    }).where(eq(pageTable.id, args.existing.id)), statements)
    await syncDocumentAssetRefs({
      db: tx,
      documentKind: 'page',
      documentId: args.existing.id,
      projectionScope: 'working',
      content: args.content,
      statements
    })
  })
  return publicationMetadata({ ...args.existing, status: 'draft' })
}

export async function publishPageWorking(args: {
  event: H3Event
  db: Db
  existing: any
  title: string | null
  content: Record<string, unknown>
  actorId: string | null
}) {
  const now = new Date()
  const revisionId = newId()
  await withDbTransaction(args.event, args.db, async (tx: Db, statements) => {
    await executeDbStatement(tx.insert(publicationRevision).values(publicationRevisionValues({
      id: revisionId,
      documentKind: 'page',
      documentId: args.existing.id,
      title: args.title,
      content: args.content,
      createdBy: args.actorId,
      createdAt: now
    })), statements)
    await executeDbStatement(tx.update(pageTable).set({
      title: args.title,
      status: 'published',
      contentJson: JSON.stringify(args.content),
      publishedRevisionId: revisionId,
      firstPublishedAt: args.existing.firstPublishedAt ?? now,
      publishedAt: now,
      updatedAt: now
    }).where(eq(pageTable.id, args.existing.id)), statements)
    for (const projectionScope of ['working', 'published'] as const) {
      await syncDocumentAssetRefs({
        db: tx,
        documentKind: 'page',
        documentId: args.existing.id,
        projectionScope,
        content: args.content,
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

export async function discardPageWorking(args: { event: H3Event, db: Db, existing: any }) {
  const revision = await getPublicationRevision(args.db, 'page', args.existing.id, args.existing.publishedRevisionId)
  if (!revision) throw conflict('No published revision to restore')
  const content = JSON.parse(revision.contentJson) as Record<string, unknown>
  const now = new Date()
  await withDbTransaction(args.event, args.db, async (tx: Db, statements) => {
    await executeDbStatement(tx.update(pageTable).set({
      title: revision.title,
      status: 'published',
      contentJson: revision.contentJson,
      updatedAt: now
    }).where(eq(pageTable.id, args.existing.id)), statements)
    await syncDocumentAssetRefs({
      db: tx,
      documentKind: 'page',
      documentId: args.existing.id,
      projectionScope: 'working',
      content,
      statements
    })
  })
  return publicationMetadata({ ...args.existing, status: 'published' })
}

export async function unpublishPage(args: { event: H3Event, db: Db, existing: any }) {
  if (!args.existing.publishedRevisionId) throw conflict('Page is not published')
  const now = new Date()
  await withDbTransaction(args.event, args.db, async (tx: Db, statements) => {
    await executeDbStatement(tx.update(pageTable).set({
      status: 'draft',
      publishedRevisionId: null,
      publishedAt: null,
      updatedAt: now
    }).where(eq(pageTable.id, args.existing.id)), statements)
    await executeDbStatement(tx.delete(documentAssetRef).where(and(
      eq(documentAssetRef.documentKind, 'page'),
      eq(documentAssetRef.documentId, args.existing.id),
      eq(documentAssetRef.projectionScope, 'published')
    )), statements)
  })
  return publicationMetadata({
    ...args.existing,
    status: 'draft',
    publishedRevisionId: null,
    publishedAt: null
  })
}
