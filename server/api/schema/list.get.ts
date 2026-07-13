import { getDb } from '../../db/db'
import { listActiveSchemas } from '../../cms/repo'
import { getSchemaRoleKey } from '../../utils/schema-permission'

export default defineEventHandler(async (event) => {
  const roleKey = await getSchemaRoleKey(event)
  const db = await getDb(event)
  const items = await listActiveSchemas(db, roleKey === 'admin' ? {} : { roleKey })
  return { items }
})
