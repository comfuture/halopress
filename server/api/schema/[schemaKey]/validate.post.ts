import { readBody } from 'h3'
import { getDb } from '../../../db/db'
import { assertSchemaKeyCanBePersisted } from '../../../cms/schema-key'
import { schemaAstSchema } from '../../../cms/zod'

export default defineEventHandler(async (event) => {
  const schemaKey = event.context.params?.schemaKey as string
  const body = await readBody<{ ast?: unknown }>(event)
  const parsed = schemaAstSchema.safeParse(body?.ast)
  if (!parsed.success) return { ok: false, error: parsed.error.flatten() }
  if (parsed.data.schemaKey !== schemaKey) {
    return { ok: false, error: { formErrors: ['schemaKey mismatch'], fieldErrors: {} } }
  }
  try {
    await assertSchemaKeyCanBePersisted(await getDb(event), schemaKey)
  } catch {
    return {
      ok: false,
      error: {
        formErrors: [],
        fieldErrors: { schemaKey: ['Schema key is reserved for a public route'] }
      }
    }
  }
  return { ok: true }
})
