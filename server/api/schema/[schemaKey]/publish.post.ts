import { readBody } from 'h3'
import { desc, eq } from 'drizzle-orm'
import { getDb } from '../../../db/db'
import { compileSchemaAst } from '../../../cms/compiler'
import { getActiveSchema, getDraft } from '../../../cms/repo'
import { getKindChanges, migrateSchemaContent } from '../../../cms/migrate'
import { schema as schemaTable, schemaActive as schemaActiveTable } from '../../../db/schema'
import { requireAdmin } from '../../../utils/auth'
import { badRequest, notFound } from '../../../utils/http'
import { schemaAstSchema } from '../../../cms/zod'

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event)
  const schemaKey = event.context.params?.schemaKey as string
  const body = await readBody<{ ast?: unknown; note?: string; migrate?: boolean }>(event)
  const db = await getDb(event)

  let ast: any = null
  if (body?.ast) {
    const parsed = schemaAstSchema.safeParse(body.ast)
    if (!parsed.success) throw badRequest('Invalid AST', parsed.error.flatten())
    ast = parsed.data
  } else {
    const draft = await getDraft(db, schemaKey)
    if (!draft) throw notFound('Draft not found')
    ast = draft.ast
  }
  if (ast.schemaKey !== schemaKey) throw badRequest('schemaKey mismatch')

  const latest = await db
    .select({ version: schemaTable.version })
    .from(schemaTable)
    .where(eq(schemaTable.schemaKey, schemaKey))
    .orderBy(desc(schemaTable.version))
    .get()

  const nextVersion = (latest?.version ?? 0) + 1
  const compiled = compileSchemaAst(ast, nextVersion)
  const active = await getActiveSchema(db, schemaKey)
  const kindChanges = getKindChanges(active?.ast ?? null, ast)

  const now = new Date()

  await db.insert(schemaTable).values({
    schemaKey,
    version: nextVersion,
    title: ast.title,
    astJson: JSON.stringify(ast),
    jsonSchema: JSON.stringify(compiled.jsonSchema),
    uiSchema: JSON.stringify(compiled.uiSchema),
    registryJson: JSON.stringify(compiled.registry),
    diffJson: JSON.stringify({ from: latest?.version ?? null, to: nextVersion }),
    createdBy: session.sub,
    createdAt: now,
    note: body?.note?.trim() || null
  })

  await db
    .insert(schemaActiveTable)
    .values({
      schemaKey,
      activeVersion: nextVersion,
      updatedAt: now
    })
    .onConflictDoUpdate({
      target: schemaActiveTable.schemaKey,
      set: {
        activeVersion: nextVersion,
        updatedAt: now
      }
    })

  let migrated = 0
  if (body?.migrate && kindChanges.length) {
    const result = await migrateSchemaContent({
      db,
      schemaKey,
      nextVersion,
      registry: compiled.registry,
      changes: kindChanges
    })
    migrated = result.updated
  }

  return { ok: true, schemaKey, version: nextVersion, migrated }
})
