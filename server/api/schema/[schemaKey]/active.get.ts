import { getDb } from '../../../db/db'
import { getActiveSchema } from '../../../cms/repo'
import { resolveDeliveryPolicy } from '../../../utils/delivery-policy'
import { notFound } from '../../../utils/http'

export default defineEventHandler(async (event) => {
  const schemaKey = event.context.params?.schemaKey as string
  await resolveDeliveryPolicy(event, schemaKey)
  const db = await getDb(event)
  const active = await getActiveSchema(db, schemaKey)
  if (!active) throw notFound('Schema not found')
  return active
})
