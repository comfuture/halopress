import { getPublishedPage } from '../../../cms/page-delivery'
import { getDb } from '../../../db/db'
import { applyPublicDeliveryHeaders } from '../../../utils/delivery-policy'
import { notFound } from '../../../utils/http'
import {
  applyPortablePublicEnvelopeHeaders,
  createPortablePageRenderingForEvent
} from '../../../utils/portable-content-delivery'

export default defineEventHandler(async (event) => {
  const id = event.context.params?.id as string
  if (!id) throw notFound('Page not found')
  const result = await getPublishedPage(await getDb(event), id)
  const response = {
    ...result,
    rendering: createPortablePageRenderingForEvent(event, result.content)
  }
  applyPublicDeliveryHeaders(event)
  if (applyPortablePublicEnvelopeHeaders(event, response)) return
  return response
})
