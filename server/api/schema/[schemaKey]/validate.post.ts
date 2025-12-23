import { readBody } from 'h3'
import { schemaAstSchema } from '../../../cms/zod'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ ast?: unknown }>(event)
  const parsed = schemaAstSchema.safeParse(body?.ast)
  if (!parsed.success) return { ok: false, error: parsed.error.flatten() }
  return { ok: true }
})

