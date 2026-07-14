import { and, eq } from 'drizzle-orm'
import { readBody } from 'h3'

import { getDocumentRevision, mutateWithDocumentRevision, requireExpectedRevision } from '../../../../../../cms/document-revisions'
import { getDraft } from '../../../../../../cms/repo'
import { getDb } from '../../../../../../db/db'
import { schemaDraft as schemaDraftTable } from '../../../../../../db/schema'
import { executeDbStatement } from '../../../../../../db/transaction'
import { requireAdmin } from '../../../../../../utils/auth'
import { notFound } from '../../../../../../utils/http'

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event)
  const actorId = (session.user as any)?.id ?? null
  const schemaKey = event.context.params?.schemaKey as string
  const targetRevision = Number(event.context.params?.revision)
  const body = await readBody<{ revision?: number }>(event)
  const expectedRevision = requireExpectedRevision(body?.revision)
  const db = await getDb(event)
  const existing = await getDraft(db, schemaKey)
  if (!existing) throw notFound('Draft not found')
  const target = await getDocumentRevision(db, 'schema-draft', schemaKey, targetRevision)

  await mutateWithDocumentRevision({
    event,
    db,
    identity: { currentRevision: existing.revision, updatedAt: existing.updatedAt, updatedBy: existing.updatedBy },
    expectedRevision,
    documentKind: 'schema-draft',
    documentId: schemaKey,
    schemaKey,
    action: 'restore',
    state: { snapshot: target.snapshot, title: target.title },
    actorId,
    work: async (tx, statements, nextRevision, now) => {
      await executeDbStatement(tx.update(schemaDraftTable).set({
        title: target.title,
        astJson: JSON.stringify(target.snapshot),
        currentRevision: nextRevision,
        updatedBy: actorId,
        updatedAt: now
      }).where(and(
        eq(schemaDraftTable.schemaKey, schemaKey),
        eq(schemaDraftTable.currentRevision, expectedRevision)
      )), statements)
    }
  })

  return { ok: true, revision: expectedRevision + 1 }
})
