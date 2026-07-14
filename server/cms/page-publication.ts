import { and, eq } from 'drizzle-orm'
import type { H3Event } from 'h3'

import type { Db } from '../db/db'
import { documentAssetRef, page as pageTable, publicationRevision } from '../db/schema'
import { executeDbStatement } from '../db/transaction'
import { conflict } from '../utils/http'
import { newId } from '../utils/ids'
import { getTrustedRequestOrigin } from '../utils/request-origin'
import { syncDocumentAssetRefs } from './asset-refs'
import { mutateWithDocumentRevision } from './document-revisions'
import { normalizePageContent } from './page-content'
import { getPublicationRevision, publicationMetadata, publicationRevisionValues } from './publication'
import { assertEditorialTransition } from './publication-transitions'

function mutationMetadata(existing: any, expectedRevision: number, overrides: Record<string, unknown>) {
  const identity = { ...existing, ...overrides }
  return {
    ...publicationMetadata(identity),
    revision: expectedRevision + 1,
    updatedAt: identity.updatedAt ?? null,
    updatedBy: identity.updatedBy ?? null,
    transitionAt: identity.transitionAt ?? null,
    transitionBy: identity.transitionBy ?? null
  }
}

export async function savePageWorking(args: {
  event: H3Event
  db: Db
  existing: any
  title: string | null
  content: Record<string, unknown>
  actorId: string | null
  expectedRevision: number
}) {
  assertEditorialTransition(args.existing.status, 'save')
  const status = args.existing.status === 'published' ? 'draft' : args.existing.status
  await mutateWithDocumentRevision({
    event: args.event,
    db: args.db,
    identity: args.existing,
    expectedRevision: args.expectedRevision,
    documentKind: 'page',
    documentId: args.existing.id,
    action: 'save',
    state: { snapshot: args.content, status, title: args.title },
    actorId: args.actorId,
    work: async (tx, statements, nextRevision, now) => {
      await executeDbStatement(tx.update(pageTable).set({
        title: args.title,
        status,
        contentJson: JSON.stringify(args.content),
        currentRevision: nextRevision,
        updatedBy: args.actorId,
        updatedAt: now
      }).where(and(
        eq(pageTable.id, args.existing.id),
        eq(pageTable.currentRevision, args.expectedRevision)
      )), statements)
      await syncDocumentAssetRefs({
        db: tx,
        documentKind: 'page',
        documentId: args.existing.id,
        projectionScope: 'working',
        content: args.content,
        trustedOrigin: getTrustedRequestOrigin(args.event),
        statements
      })
    }
  })
  return mutationMetadata(args.existing, args.expectedRevision, {
    status,
    updatedBy: args.actorId
  })
}

export async function publishPageWorking(args: {
  event: H3Event
  db: Db
  existing: any
  title: string | null
  content: Record<string, unknown>
  actorId: string | null
  expectedRevision: number
}) {
  assertEditorialTransition(args.existing.status, 'publish')
  const revisionId = newId()
  let publishedAt = new Date()
  await mutateWithDocumentRevision({
    event: args.event,
    db: args.db,
    identity: args.existing,
    expectedRevision: args.expectedRevision,
    documentKind: 'page',
    documentId: args.existing.id,
    action: 'publish',
    state: { snapshot: args.content, status: 'published', title: args.title },
    actorId: args.actorId,
    work: async (tx, statements, nextRevision, now) => {
      publishedAt = now
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
        currentRevision: nextRevision,
        publishedRevisionId: revisionId,
        firstPublishedAt: args.existing.firstPublishedAt ?? now,
        publishedAt: now,
        publishedBy: args.actorId,
        transitionAt: now,
        transitionBy: args.actorId,
        deletedAt: null,
        deletedBy: null,
        updatedBy: args.actorId,
        updatedAt: now
      }).where(and(
        eq(pageTable.id, args.existing.id),
        eq(pageTable.currentRevision, args.expectedRevision)
      )), statements)
      for (const projectionScope of ['working', 'published'] as const) {
        await syncDocumentAssetRefs({
          db: tx,
          documentKind: 'page',
          documentId: args.existing.id,
          projectionScope,
          content: args.content,
          trustedOrigin: getTrustedRequestOrigin(args.event),
          statements
        })
      }
    }
  })
  return mutationMetadata(args.existing, args.expectedRevision, {
    status: 'published',
    publishedRevisionId: revisionId,
    firstPublishedAt: args.existing.firstPublishedAt ?? publishedAt,
    publishedAt,
    publishedBy: args.actorId,
    transitionAt: publishedAt,
    transitionBy: args.actorId,
    updatedBy: args.actorId
  })
}

export async function discardPageWorking(args: {
  event: H3Event
  db: Db
  existing: any
  actorId: string | null
  expectedRevision: number
}) {
  assertEditorialTransition(args.existing.status, 'discard')
  const revision = await getPublicationRevision(args.db, 'page', args.existing.id, args.existing.publishedRevisionId)
  if (!revision) throw conflict('No published revision to restore')
  const content = normalizePageContent(revision.contentJson)
  await mutateWithDocumentRevision({
    event: args.event,
    db: args.db,
    identity: args.existing,
    expectedRevision: args.expectedRevision,
    documentKind: 'page',
    documentId: args.existing.id,
    action: 'discard',
    state: { snapshot: content, status: 'published', title: revision.title },
    actorId: args.actorId,
    work: async (tx, statements, nextRevision, now) => {
      await executeDbStatement(tx.update(pageTable).set({
        title: revision.title,
        status: 'published',
        contentJson: revision.contentJson,
        currentRevision: nextRevision,
        transitionAt: now,
        transitionBy: args.actorId,
        updatedBy: args.actorId,
        updatedAt: now
      }).where(and(
        eq(pageTable.id, args.existing.id),
        eq(pageTable.currentRevision, args.expectedRevision)
      )), statements)
      await syncDocumentAssetRefs({
        db: tx,
        documentKind: 'page',
        documentId: args.existing.id,
        projectionScope: 'working',
        content,
        trustedOrigin: getTrustedRequestOrigin(args.event),
        statements
      })
    }
  })
  return mutationMetadata(args.existing, args.expectedRevision, {
    status: 'published',
    updatedBy: args.actorId
  })
}

export async function unpublishPage(args: {
  event: H3Event
  db: Db
  existing: any
  actorId: string | null
  expectedRevision: number
}) {
  assertEditorialTransition(args.existing.status, 'archive')
  const content = normalizePageContent(args.existing.contentJson)
  await mutateWithDocumentRevision({
    event: args.event,
    db: args.db,
    identity: args.existing,
    expectedRevision: args.expectedRevision,
    documentKind: 'page',
    documentId: args.existing.id,
    action: 'archive',
    state: { snapshot: content, status: 'archived', title: args.existing.title },
    actorId: args.actorId,
    work: async (tx, statements, nextRevision, now) => {
      await executeDbStatement(tx.update(pageTable).set({
        status: 'archived',
        currentRevision: nextRevision,
        publishedRevisionId: null,
        publishedAt: null,
        publishedBy: null,
        transitionAt: now,
        transitionBy: args.actorId,
        updatedBy: args.actorId,
        updatedAt: now
      }).where(and(
        eq(pageTable.id, args.existing.id),
        eq(pageTable.currentRevision, args.expectedRevision)
      )), statements)
      await executeDbStatement(tx.delete(documentAssetRef).where(and(
        eq(documentAssetRef.documentKind, 'page'),
        eq(documentAssetRef.documentId, args.existing.id),
        eq(documentAssetRef.projectionScope, 'published')
      )), statements)
    }
  })
  return mutationMetadata(args.existing, args.expectedRevision, {
    status: 'archived',
    publishedRevisionId: null,
    publishedAt: null,
    publishedBy: null,
    updatedBy: args.actorId
  })
}

export async function deletePage(args: {
  event: H3Event
  db: Db
  existing: any
  actorId: string | null
  expectedRevision: number
}) {
  assertEditorialTransition(args.existing.status, 'delete')
  const content = normalizePageContent(args.existing.contentJson)
  await mutateWithDocumentRevision({
    event: args.event,
    db: args.db,
    identity: args.existing,
    expectedRevision: args.expectedRevision,
    documentKind: 'page',
    documentId: args.existing.id,
    action: 'delete',
    state: { snapshot: content, status: 'deleted', title: args.existing.title },
    actorId: args.actorId,
    work: async (tx, statements, nextRevision, now) => {
      await executeDbStatement(tx.update(pageTable).set({
        status: 'deleted',
        currentRevision: nextRevision,
        publishedRevisionId: null,
        publishedAt: null,
        publishedBy: null,
        transitionAt: now,
        transitionBy: args.actorId,
        deletedAt: now,
        deletedBy: args.actorId,
        updatedBy: args.actorId,
        updatedAt: now
      }).where(and(
        eq(pageTable.id, args.existing.id),
        eq(pageTable.currentRevision, args.expectedRevision)
      )), statements)
      await executeDbStatement(tx.delete(documentAssetRef).where(and(
        eq(documentAssetRef.documentKind, 'page'),
        eq(documentAssetRef.documentId, args.existing.id),
        eq(documentAssetRef.projectionScope, 'published')
      )), statements)
    }
  })
  return mutationMetadata(args.existing, args.expectedRevision, {
    status: 'deleted',
    publishedRevisionId: null,
    updatedBy: args.actorId
  })
}

export async function recoverPage(args: {
  event: H3Event
  db: Db
  existing: any
  actorId: string | null
  expectedRevision: number
}) {
  assertEditorialTransition(args.existing.status, 'recover')
  const content = normalizePageContent(args.existing.contentJson)
  await mutateWithDocumentRevision({
    event: args.event,
    db: args.db,
    identity: args.existing,
    expectedRevision: args.expectedRevision,
    documentKind: 'page',
    documentId: args.existing.id,
    action: 'recover',
    state: { snapshot: content, status: 'draft', title: args.existing.title },
    actorId: args.actorId,
    work: async (tx, statements, nextRevision, now) => {
      await executeDbStatement(tx.update(pageTable).set({
        status: 'draft',
        currentRevision: nextRevision,
        transitionAt: now,
        transitionBy: args.actorId,
        deletedAt: null,
        deletedBy: null,
        updatedBy: args.actorId,
        updatedAt: now
      }).where(and(
        eq(pageTable.id, args.existing.id),
        eq(pageTable.currentRevision, args.expectedRevision)
      )), statements)
      await syncDocumentAssetRefs({
        db: tx,
        documentKind: 'page',
        documentId: args.existing.id,
        projectionScope: 'working',
        content,
        trustedOrigin: getTrustedRequestOrigin(args.event),
        statements
      })
    }
  })
  return mutationMetadata(args.existing, args.expectedRevision, { status: 'draft', updatedBy: args.actorId })
}

export async function restorePageRevision(args: {
  event: H3Event
  db: Db
  existing: any
  title: string | null
  content: Record<string, unknown>
  actorId: string | null
  expectedRevision: number
}) {
  assertEditorialTransition(args.existing.status, 'restore')
  await mutateWithDocumentRevision({
    event: args.event,
    db: args.db,
    identity: args.existing,
    expectedRevision: args.expectedRevision,
    documentKind: 'page',
    documentId: args.existing.id,
    action: 'restore',
    state: { snapshot: args.content, status: 'draft', title: args.title },
    actorId: args.actorId,
    work: async (tx, statements, nextRevision, now) => {
      await executeDbStatement(tx.update(pageTable).set({
        title: args.title,
        status: 'draft',
        contentJson: JSON.stringify(args.content),
        currentRevision: nextRevision,
        transitionAt: now,
        transitionBy: args.actorId,
        deletedAt: null,
        deletedBy: null,
        updatedBy: args.actorId,
        updatedAt: now
      }).where(and(
        eq(pageTable.id, args.existing.id),
        eq(pageTable.currentRevision, args.expectedRevision)
      )), statements)
      await syncDocumentAssetRefs({
        db: tx,
        documentKind: 'page',
        documentId: args.existing.id,
        projectionScope: 'working',
        content: args.content,
        trustedOrigin: getTrustedRequestOrigin(args.event),
        statements
      })
    }
  })
  return mutationMetadata(args.existing, args.expectedRevision, { status: 'draft', updatedBy: args.actorId })
}
