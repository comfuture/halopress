import { and, eq } from 'drizzle-orm'
import type { H3Event } from 'h3'

import { getDb } from '../db/db'
import { documentAssetRef } from '../db/schema'
import { getAuthSession } from './auth'
import { applyPrivateDeliveryHeaders, applyPublicDeliveryHeaders } from './delivery-policy'
import { conflict, notFound } from './http'

export async function assertAssetIsNotRetained(db: Awaited<ReturnType<typeof getDb>>, assetId: string) {
  const retainedBy = await db
    .select({ documentId: documentAssetRef.documentId })
    .from(documentAssetRef)
    .where(eq(documentAssetRef.assetId, assetId))
    .limit(1)
  if (retainedBy[0]) throw conflict('Asset is referenced by a working or published document')
}

export async function assertAssetIsNotPublished(db: Awaited<ReturnType<typeof getDb>>, assetId: string) {
  const retainedBy = await db
    .select({ documentId: documentAssetRef.documentId })
    .from(documentAssetRef)
    .where(and(
      eq(documentAssetRef.assetId, assetId),
      eq(documentAssetRef.projectionScope, 'published')
    ))
    .limit(1)
  if (retainedBy[0]) throw conflict('Asset is referenced by a published document')
}

export async function requireAssetDelivery(event: H3Event, assetId: string) {
  const session = await getAuthSession(event)
  if (session?.user) {
    applyPrivateDeliveryHeaders(event)
    return { isPublic: false }
  }

  const db = await getDb(event)
  const publishedRef = await db.select({ assetId: documentAssetRef.assetId })
    .from(documentAssetRef)
    .where(and(
      eq(documentAssetRef.assetId, assetId),
      eq(documentAssetRef.projectionScope, 'published')
    ))
    .limit(1)
  if (!publishedRef[0]) throw notFound('Asset not found')
  applyPublicDeliveryHeaders(event)
  return { isPublic: true }
}
