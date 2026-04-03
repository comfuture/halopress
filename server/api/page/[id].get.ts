import { eq } from 'drizzle-orm'

import { getDb } from '../../db/db'
import { page as pageTable } from '../../db/schema'
import { requireAdmin } from '../../utils/auth'
import { notFound } from '../../utils/http'

const emptyDoc = { type: 'doc', content: [{ type: 'paragraph' }] }

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = event.context.params?.id as string
  if (!id) throw notFound('Page not found')

  const db = await getDb(event)
  const row = await db
    .select({
      id: pageTable.id,
      title: pageTable.title,
      status: pageTable.status,
      contentJson: pageTable.contentJson,
      createdAt: pageTable.createdAt,
      updatedAt: pageTable.updatedAt
    })
    .from(pageTable)
    .where(eq(pageTable.id, id))
    .get()

  if (!row) throw notFound('Page not found')

  let content = emptyDoc
  try {
    const parsed = JSON.parse(row.contentJson)
    if (parsed && typeof parsed === 'object') content = parsed
  } catch {
    content = emptyDoc
  }

  return { ...row, content }
})
