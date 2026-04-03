import { readBody } from 'h3'
import { eq } from 'drizzle-orm'

import { getDb } from '../../db/db'
import { page as pageTable } from '../../db/schema'
import { requireAdmin } from '../../utils/auth'
import { badRequest, notFound } from '../../utils/http'

const emptyDoc = { type: 'doc', content: [{ type: 'paragraph' }] }

function normalizeContent(value: unknown) {
  if (value == null) return emptyDoc
  let parsed = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch {
      throw badRequest('Invalid content JSON')
    }
  }

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed
  }

  throw badRequest('Invalid content JSON')
}

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = event.context.params?.id as string
  if (!id) throw notFound('Page not found')

  const body = await readBody<{ title?: string; status?: string; content?: unknown }>(event)

  const updates: Record<string, any> = {
    updatedAt: new Date()
  }

  if (body?.title !== undefined) updates.title = body.title?.trim() || null
  if (body?.status !== undefined) updates.status = body.status || 'draft'
  if (body?.content !== undefined) updates.contentJson = JSON.stringify(normalizeContent(body.content))

  const db = await getDb(event)
  const existing = await db
    .select({ id: pageTable.id })
    .from(pageTable)
    .where(eq(pageTable.id, id))
    .get()

  if (!existing) throw notFound('Page not found')

  await db.update(pageTable).set(updates).where(eq(pageTable.id, id))
  return { ok: true }
})
