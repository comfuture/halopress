import { readBody } from 'h3'

import { getDb } from '../../db/db'
import { page as pageTable } from '../../db/schema'
import { requireAdmin } from '../../utils/auth'
import { badRequest } from '../../utils/http'
import { newId } from '../../utils/ids'

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
  const session = await requireAdmin(event)
  const body = await readBody<{ title?: string; status?: string; content?: unknown }>(event)

  const id = newId()
  const now = new Date()
  const title = body?.title?.trim() || null
  const status = body?.status || 'draft'
  const content = normalizeContent(body?.content)

  const db = await getDb(event)
  await db.insert(pageTable).values({
    id,
    title,
    status,
    contentJson: JSON.stringify(content),
    createdBy: (session.user as any)?.id ?? null,
    createdAt: now,
    updatedAt: now
  })

  return { ok: true, id }
})
