import { and, eq } from 'drizzle-orm'

import { getDb } from '../../../db/db'
import { schemaRole as schemaRoleTable } from '../../../db/schema'
import { getAuthSession } from '../../../utils/auth'
import { badRequest } from '../../../utils/http'

export default defineEventHandler(async (event) => {
  const schemaKey = event.context.params?.schemaKey as string
  if (!schemaKey) throw badRequest('Missing schema key')

  const session = await getAuthSession(event)
  const user = session?.user as { role?: string } | undefined
  const roleKey = user?.role || 'anonymous'

  const db = await getDb(event)
  const permission = await db
    .select({
      canRead: schemaRoleTable.canRead,
      canWrite: schemaRoleTable.canWrite,
      canAdmin: schemaRoleTable.canAdmin
    })
    .from(schemaRoleTable)
    .where(and(
      eq(schemaRoleTable.schemaKey, schemaKey),
      eq(schemaRoleTable.roleKey, roleKey)
    ))
    .get()

  return {
    roleKey,
    canRead: !!permission?.canRead,
    canWrite: !!permission?.canWrite,
    canAdmin: !!permission?.canAdmin
  }
})
