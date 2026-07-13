import { eq } from 'drizzle-orm'
import { readBody } from 'h3'

import { normalizePageContent } from '../../cms/page-content'
import { publishPageWorking, savePageWorking } from '../../cms/page-publication'
import { getDb } from '../../db/db'
import { page as pageTable } from '../../db/schema'
import { requireAdmin } from '../../utils/auth'
import { notFound } from '../../utils/http'

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event)
  const id = event.context.params?.id as string
  if (!id) throw notFound('Page not found')
  const body = await readBody<{ title?: string, status?: string, content?: unknown }>(event)
  const db = await getDb(event)
  const existing = await db.select().from(pageTable).where(eq(pageTable.id, id)).get()
  if (!existing) throw notFound('Page not found')

  const title = body?.title !== undefined ? body.title.trim() || null : existing.title
  const content = body?.content !== undefined ? normalizePageContent(body.content) : normalizePageContent(existing.contentJson)
  const publication = body?.status === 'published'
    ? await publishPageWorking({
        event,
        db,
        existing,
        title,
        content,
        actorId: (session.user as any)?.id ?? null
      })
    : await savePageWorking({ event, db, existing, title, content })
  return { ok: true, ...publication }
})
