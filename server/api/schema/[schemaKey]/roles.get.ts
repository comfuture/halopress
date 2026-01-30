import { and, asc, desc, eq } from 'drizzle-orm'

import { getDb } from '../../../db/db'
import { schemaRole as schemaRoleTable, userRole as userRoleTable } from '../../../db/schema'
import { requireAdmin } from '../../../utils/auth'
import { badRequest } from '../../../utils/http'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const schemaKey = event.context.params?.schemaKey as string
  if (!schemaKey) throw badRequest('Missing schema key')

  const db = await getDb(event)

  const rows = await db
    .select({
      roleKey: userRoleTable.roleKey,
      title: userRoleTable.title,
      level: userRoleTable.level,
      canRead: schemaRoleTable.canRead,
      canWrite: schemaRoleTable.canWrite,
      canAdmin: schemaRoleTable.canAdmin
    })
    .from(userRoleTable)
    .leftJoin(schemaRoleTable, and(
      eq(schemaRoleTable.roleKey, userRoleTable.roleKey),
      eq(schemaRoleTable.schemaKey, schemaKey)
    ))
    .orderBy(desc(userRoleTable.level), asc(userRoleTable.roleKey))

  return {
    items: rows.map(row => ({
      roleKey: row.roleKey,
      title: row.title ?? null,
      level: row.level ?? 0,
      canRead: !!row.canRead,
      canWrite: !!row.canWrite,
      canAdmin: !!row.canAdmin
    }))
  }
})
