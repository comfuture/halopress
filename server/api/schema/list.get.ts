import { getDb } from '../../db/db'
import { listActiveSchemas } from '../../cms/repo'

export default defineEventHandler(async (event) => {
  const db = await getDb(event)
  const items = await listActiveSchemas(db)
  return { items }
})

