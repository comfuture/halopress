import { getQuery } from 'h3'

import { resolvePublicRoute } from '../../cms/public-routes'
import { resolvePublicSeo } from '../../cms/public-seo'
import { getDb } from '../../db/db'
import { applyPreviewDeliveryHeaders, applyPublicDeliveryHeaders } from '../../utils/delivery-policy'
import { badRequest, notFound } from '../../utils/http'

export default defineEventHandler(async (event) => {
  const path = getQuery(event).path
  if (typeof path !== 'string' || !path) throw badRequest('Public path is required')
  const db = await getDb(event)
  const route = await resolvePublicRoute(db, path)
  if (!route) {
    event.context.publicDeliveryPrivateNoindex = true
    applyPreviewDeliveryHeaders(event)
    throw notFound('Public route not found')
  }
  const seo = await resolvePublicSeo({
    event,
    db,
    documentKind: route.documentKind,
    documentId: route.documentId,
    schemaKey: route.schemaKey,
    canonicalPath: route.canonicalPath,
    overrides: route.seo
  })
  applyPublicDeliveryHeaders(event)
  return { ...route, seo }
})
