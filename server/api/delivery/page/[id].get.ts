import { getPublishedPage } from '../../../cms/page-delivery'
import { getDb } from '../../../db/db'
import { applyPublicDeliveryHeaders } from '../../../utils/delivery-policy'
import { notFound } from '../../../utils/http'

export default defineEventHandler(async (event) => {
  const id = event.context.params?.id as string
  if (!id) throw notFound('Page not found')
  const result = await getPublishedPage(await getDb(event), id)
  applyPublicDeliveryHeaders(event)
  return result
})
