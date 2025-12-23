import { getDb } from '../../../db/db'
import { listSchemaVersions } from '../../../cms/repo'

export default defineEventHandler(async (event) => {
  const schemaKey = event.context.params?.schemaKey as string
  const db = await getDb(event)
  const items = await listSchemaVersions(db, schemaKey)
  return { items }
})

