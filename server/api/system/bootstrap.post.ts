import { getDb } from '../../db/db'
import { compileSchemaAst } from '../../cms/compiler'
import { defaultArticleSchemaAst } from '../../cms/defaults'
import { schema as schemaTable, schemaActive as schemaActiveTable, content as contentTable } from '../../db/schema'
import { requireAdmin } from '../../utils/auth'
import { newId } from '../../utils/ids'
import { upsertContentListingSnapshot } from '../../cms/content-listing'
import { ensureAnonymousSchemaRole } from '../../utils/install'
import { syncSearchConfig } from '../../cms/search-config'

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event)
  const actorId = (session.user as any)?.id ?? null
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
    createdBy: actorId,
    createdAt: now,
    note: 'bootstrap'
  })

  await db.insert(schemaActiveTable).values({
    schemaKey: ast.schemaKey,
    activeVersion: 1,
    updatedAt: now
  })

  await ensureAnonymousSchemaRole(db, ast.schemaKey)
  await syncSearchConfig({ db, schemaKey: ast.schemaKey, registry: compiled.registry })

  const id = newId()
  const bootstrapContent = {
    title: 'Hello Halopress',
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
    status: 'published',
    contentJson: JSON.stringify(bootstrapContent),
    createdBy: actorId,
    createdAt: now,
    updatedAt: now
  })

  await upsertContentListingSnapshot({
    db,
    registry: compiled.registry,
    content: bootstrapContent,
    contentId: id,
    schemaKey: ast.schemaKey,
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now
  })

  return { ok: true, schemaKey: ast.schemaKey }
})
