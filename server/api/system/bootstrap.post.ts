import { getDb } from '../../db/db'
import { compileSchemaAst } from '../../cms/compiler'
import { defaultArticleSchemaAst } from '../../cms/defaults'
import { schema as schemaTable, schemaActive as schemaActiveTable, content as contentTable } from '../../db/schema'
import { requireAdmin } from '../../utils/auth'
import { newId } from '../../utils/ids'
import { upsertContentItemSnapshot } from '../../cms/content-items'
import { ensureAnonymousSchemaRole } from '../../utils/install'
import { syncContentFields } from '../../cms/search-index'

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event)
  const db = await getDb(event)

  const existing = await db
    .select({ schemaKey: schemaActiveTable.schemaKey })
    .from(schemaActiveTable)
    .limit(1)

  if (existing.length) return { ok: true, already: true }

  const now = new Date()
  const ast = defaultArticleSchemaAst()
  const version = 1
  const compiled = compileSchemaAst(ast, version)

  await db.insert(schemaTable).values({
    schemaKey: ast.schemaKey,
    version,
    title: ast.title,
    astJson: JSON.stringify(ast),
    jsonSchema: JSON.stringify(compiled.jsonSchema),
    uiSchema: JSON.stringify(compiled.uiSchema),
    registryJson: JSON.stringify(compiled.registry),
    diffJson: JSON.stringify({ from: null, to: 1 }),
    createdBy: session.sub,
    createdAt: now,
    note: 'bootstrap'
  })

  await db.insert(schemaActiveTable).values({
    schemaKey: ast.schemaKey,
    activeVersion: 1,
    updatedAt: now
  })

  await ensureAnonymousSchemaRole(db, ast.schemaKey)
  await syncContentFields({ db, schemaKey: ast.schemaKey, registry: compiled.registry })

  const id = newId()
  const bootstrapExtra = {
    body: {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Hello Halopress' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'This is your first article.' }] }
      ]
    }
  }

  await db.insert(contentTable).values({
    id,
    schemaKey: ast.schemaKey,
    schemaVersion: 1,
    title: 'Hello Halopress',
    status: 'published',
    extraJson: JSON.stringify(bootstrapExtra),
    createdBy: session.sub,
    createdAt: now,
    updatedAt: now
  })

  await upsertContentItemSnapshot({
    db,
    registry: compiled.registry,
    extra: bootstrapExtra,
    contentId: id,
    schemaKey: ast.schemaKey,
    schemaVersion: 1,
    title: 'Hello Halopress',
    status: 'published',
    createdAt: now,
    updatedAt: now
  })

  return { ok: true, schemaKey: ast.schemaKey }
})
