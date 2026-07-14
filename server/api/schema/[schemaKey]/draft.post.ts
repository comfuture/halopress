import { and, eq } from 'drizzle-orm'
import { readBody } from 'h3'
import { getDb } from '../../../db/db'
import { getDraft } from '../../../cms/repo'
import { createInitialDocumentRevision, mutateWithDocumentRevision, requireExpectedRevision } from '../../../cms/document-revisions'
import { assertSchemaKeyCanBePersisted } from '../../../cms/schema-key'
import { schemaAstSchema } from '../../../cms/zod'
import { schemaDraft as schemaDraftTable } from '../../../db/schema'
import { executeDbStatement, withDbTransaction } from '../../../db/transaction'
import { requireAdmin } from '../../../utils/auth'
import { badRequest } from '../../../utils/http'

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event)
  const actorId = (session.user as any)?.id ?? null
  const schemaKey = event.context.params?.schemaKey as string
  const body = await readBody<{ ast?: unknown; title?: string; revision?: number }>(event)

  const parsed = schemaAstSchema.safeParse(body?.ast)
  if (!parsed.success) throw badRequest('Invalid AST', parsed.error.flatten())
  if (parsed.data.schemaKey !== schemaKey) throw badRequest('schemaKey mismatch')

  const title = body?.title?.trim() || parsed.data.title
  const db = await getDb(event)
  await assertSchemaKeyCanBePersisted(db, schemaKey)
  const existing = await getDraft(db, schemaKey)
  const now = new Date()

  if (!existing) {
    await withDbTransaction(event, db, async (tx: any, statements) => {
      await executeDbStatement(tx.insert(schemaDraftTable).values({
        schemaKey,
        title,
        astJson: JSON.stringify(parsed.data),
        currentRevision: 1,
        updatedBy: actorId,
        updatedAt: now
      }), statements)
      await createInitialDocumentRevision({
        tx,
        statements,
        documentKind: 'schema-draft',
        documentId: schemaKey,
        schemaKey,
        state: { snapshot: parsed.data, title },
        actorId,
        createdAt: now
      })
    })
    return { ok: true, revision: 1 }
  }

  const expectedRevision = requireExpectedRevision(body?.revision)
  await mutateWithDocumentRevision({
    event,
    db,
    identity: { currentRevision: existing.revision, updatedAt: existing.updatedAt, updatedBy: existing.updatedBy },
    expectedRevision,
    documentKind: 'schema-draft',
    documentId: schemaKey,
    schemaKey,
    action: 'save',
    state: { snapshot: parsed.data, title },
    actorId,
    work: async (tx, statements, nextRevision, savedAt) => {
      await executeDbStatement(tx.update(schemaDraftTable).set({
        title,
        astJson: JSON.stringify(parsed.data),
        currentRevision: nextRevision,
        updatedBy: actorId,
        updatedAt: savedAt
      }).where(and(
        eq(schemaDraftTable.schemaKey, schemaKey),
        eq(schemaDraftTable.currentRevision, expectedRevision)
      )), statements)
    }
  })

  return { ok: true, revision: expectedRevision + 1 }
})
