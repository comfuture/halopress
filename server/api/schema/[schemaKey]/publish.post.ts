import { readBody } from 'h3'
import { desc, eq } from 'drizzle-orm'
import { getDb } from '../../../db/db'
import { compileSchemaAst } from '../../../cms/compiler'
import { syncContentListing } from '../../../cms/content-listing'
import { getDraft, getPublishedSchema } from '../../../cms/repo'
import { getKindChanges, migrateSchemaContent } from '../../../cms/migrate'
import { syncSearchConfig } from '../../../cms/search-config'
import { syncSearchIndexForSchema } from '../../../cms/search-index'
import { schema as schemaTable, schemaActive as schemaActiveTable } from '../../../db/schema'
import { requireAdmin } from '../../../utils/auth'
import { badRequest, notFound } from '../../../utils/http'
import { schemaAstSchema } from '../../../cms/zod'
import { assertSchemaKeyCanBePersisted, assertSchemaKeyCanBePublished } from '../../../cms/schema-key'
import { assertExpectedRevision, requireExpectedRevision } from '../../../cms/document-revisions'
import { ensureAnonymousSchemaRole } from '../../../utils/install'
import { getTrustedRequestOrigin } from '../../../utils/request-origin'
import { queueWidgetCacheInvalidation } from '../../../utils/widget-cache'
import { assertPublicRouteAvailable, publishSchemaCollectionRoute } from '../../../cms/public-routes'

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event)
  const actorId = (session.user as any)?.id ?? null
  const schemaKey = event.context.params?.schemaKey as string
  const body = await readBody<{ ast?: unknown; note?: string; migrate?: boolean; revision?: number }>(event)
  const db = await getDb(event)

  const draft = await getDraft(db, schemaKey)
  if (!draft) throw notFound('Draft not found')
  assertExpectedRevision({
    currentRevision: draft.revision,
    updatedAt: draft.updatedAt,
    updatedBy: draft.updatedBy
  }, requireExpectedRevision(body?.revision))

  let ast: any = null
  if (body?.ast) {
    const parsed = schemaAstSchema.safeParse(body.ast)
    if (!parsed.success) throw badRequest('Invalid AST', parsed.error.flatten())
    ast = parsed.data
  } else {
    ast = draft.ast
  }
  if (ast.schemaKey !== schemaKey) throw badRequest('schemaKey mismatch')
  await assertSchemaKeyCanBePersisted(db, schemaKey)
  assertSchemaKeyCanBePublished(schemaKey)

  const latest = await db
    .select({ version: schemaTable.version })
    .from(schemaTable)
    .where(eq(schemaTable.schemaKey, schemaKey))
    .orderBy(desc(schemaTable.version))
    .get()

  const nextVersion = (latest?.version ?? 0) + 1
  let compiled: ReturnType<typeof compileSchemaAst>
  try {
    compiled = compileSchemaAst(ast, nextVersion)
  } catch (error) {
    throw badRequest(error instanceof Error ? error.message : 'Invalid presentation bindings')
  }
  const active = await getPublishedSchema(db, schemaKey, { includeInactive: true })
  const kindChanges = getKindChanges(active?.ast ?? null, ast)
  const listingChanged = JSON.stringify(active?.registry?.listing ?? null) !== JSON.stringify(compiled.registry.listing ?? null)

  const now = new Date()

  // Schema publication has several legacy post-publish synchronization steps,
  // so reject collection-path collisions before writing the new version.
  await assertPublicRouteAvailable({
    db,
    documentKind: 'schema',
    documentId: schemaKey,
    path: `/${schemaKey}`
  })

  await db.insert(schemaTable).values({
    schemaKey,
    version: nextVersion,
    title: ast.title,
    astJson: JSON.stringify(ast),
    jsonSchema: JSON.stringify(compiled.jsonSchema),
    uiSchema: JSON.stringify(compiled.uiSchema),
    registryJson: JSON.stringify(compiled.registry),
    diffJson: JSON.stringify({ from: latest?.version ?? null, to: nextVersion }),
    createdBy: actorId,
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

  await ensureAnonymousSchemaRole(db, schemaKey)
  await publishSchemaCollectionRoute({ db, schemaKey, now })

  let migrated = 0
  if (body?.migrate && kindChanges.length) {
    const result = await migrateSchemaContent({
      event,
      db,
      schemaKey,
      nextVersion,
      registry: compiled.registry,
      changes: kindChanges,
      actorId,
      trustedOrigin: getTrustedRequestOrigin(event)
    })
    migrated = result.updated
  }

  await syncSearchConfig({ db, schemaKey, registry: compiled.registry })
  const searchIndex = await syncSearchIndexForSchema({ db, schemaKey, registry: compiled.registry })

  if (listingChanged && !(body?.migrate && kindChanges.length)) {
    await syncContentListing({ db, schemaKey, onlyMissing: false })
  }

  if (listingChanged || migrated > 0) {
    queueWidgetCacheInvalidation(event, `schema:${schemaKey}`)
  }

  return { ok: true, schemaKey, version: nextVersion, migrated, searchIndexed: searchIndex.indexed }
})
