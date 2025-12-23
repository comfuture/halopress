import { readBody } from 'h3'
import { getDb } from '../../../db/db'
import { upsertDraft } from '../../../cms/repo'
import { schemaAstSchema } from '../../../cms/zod'
import { requireAdmin } from '../../../utils/auth'
import { badRequest } from '../../../utils/http'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const schemaKey = event.context.params?.schemaKey as string
  const body = await readBody<{ ast?: unknown; title?: string }>(event)

  const parsed = schemaAstSchema.safeParse(body?.ast)
  if (!parsed.success) throw badRequest('Invalid AST', parsed.error.flatten())
  if (parsed.data.schemaKey !== schemaKey) throw badRequest('schemaKey mismatch')

  const title = body?.title?.trim() || parsed.data.title
  const db = await getDb(event)
  await upsertDraft(db, schemaKey, title, parsed.data)

  return { ok: true }
})

