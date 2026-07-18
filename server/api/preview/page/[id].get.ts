import { eq } from 'drizzle-orm'

import { parseStoredPageContent } from '../../../cms/page-content'
import { publicationMetadata } from '../../../cms/publication'
import { getDb } from '../../../db/db'
import { page as pageTable } from '../../../db/schema'
import { requireAdmin } from '../../../utils/auth'
import { applyPreviewDeliveryHeaders } from '../../../utils/delivery-policy'
import { notFound, sendH3Error } from '../../../utils/http'
import {
  resolvePreviewLayoutCanonicalPath,
  resolvePreviewPageLayoutRendering
} from '../../../utils/layout-rendering'
import { createPortablePageRenderingForEvent } from '../../../utils/portable-content-delivery'

export default defineEventHandler(async (event) => {
  applyPreviewDeliveryHeaders(event)
  try {
    await requireAdmin(event)
  } catch (error: any) {
    if (error?.statusCode === 401) return sendH3Error(event, notFound('Page not found'))
    throw error
  }
  const id = event.context.params?.id as string
  const db = await getDb(event)
  const row = await db.select().from(pageTable).where(eq(pageTable.id, id)).get()
  if (!row || row.status === 'deleted') return sendH3Error(event, notFound('Page not found'))
  const content = parseStoredPageContent(row.contentJson)
  const rendering = await createPortablePageRenderingForEvent(event, content)
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    content,
    rendering,
    layout: await resolvePreviewPageLayoutRendering(event, {
      visibility: 'preview',
      documentKind: 'page',
      documentId: row.id,
      schemaKey: null,
      schemaVersion: null,
      canonicalPath: resolvePreviewLayoutCanonicalPath(row.publicPath)
    }, rendering.outline),
    updatedAt: row.updatedAt,
    ...publicationMetadata(row)
  }
})
