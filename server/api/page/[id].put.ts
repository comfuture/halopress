import { eq } from 'drizzle-orm'
import { readBody } from 'h3'

import { normalizePageContent } from '../../cms/page-content'
import { savePageWorking } from '../../cms/page-publication'
import { getDb } from '../../db/db'
import { page as pageTable } from '../../db/schema'
import { requireAdmin } from '../../utils/auth'
import { notFound } from '../../utils/http'
import { requireExpectedRevision } from '../../cms/document-revisions'
import { assertDraftWriteStatus } from '../../cms/publication-transitions'

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event)
  const id = event.context.params?.id as string
  if (!id) throw notFound('Page not found')
  const body = await readBody<{ revision?: number, title?: string, status?: string, content?: unknown }>(event)
  assertDraftWriteStatus(body?.status)
  const expectedRevision = requireExpectedRevision(body?.revision)
  const db = await getDb(event)
  const existing = await db.select().from(pageTable).where(eq(pageTable.id, id)).get()
  if (!existing) throw notFound('Page not found')

  const title = body?.title !== undefined ? body.title.trim() || null : existing.title
  const content = body?.content !== undefined ? normalizePageContent(body.content) : normalizePageContent(existing.contentJson)
  const publication = await savePageWorking({
    event,
    db,
    existing,
    title,
    content,
    actorId: (session.user as any)?.id ?? null,
    expectedRevision
  })
  return { ok: true, ...publication }
})
