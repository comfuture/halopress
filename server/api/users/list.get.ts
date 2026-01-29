import { and, desc, eq, ne, sql } from 'drizzle-orm'
import { getQuery } from 'h3'

import { getDb } from '../../db/db'
import { user as userTable, userRole as userRoleTable } from '../../db/schema'
import { requireAdmin } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const q = getQuery(event)
  const limit = Math.min(Number(q.limit ?? 50) || 50, 200)
  const status = typeof q.status === 'string' && q.status.length ? q.status : null
  const roleKey = typeof q.roleKey === 'string' && q.roleKey.length ? q.roleKey : null

  const db = await getDb(event)

  const whereParts: any[] = []
  if (status) whereParts.push(eq(userTable.status, status))
  if (roleKey) whereParts.push(eq(userTable.roleKey, roleKey))

  let query = db
    .select({
      id: userTable.id,
      email: userTable.email,
      name: userTable.name,
      roleKey: userTable.roleKey,
      roleTitle: userRoleTable.title,
      roleLevel: userRoleTable.level,
      status: userTable.status,
      createdAt: userTable.createdAt
    })
    .from(userTable)
    .leftJoin(userRoleTable, eq(userTable.roleKey, userRoleTable.roleKey))

  if (whereParts.length) {
    query = query.where(and(...whereParts))
  }

  const items = await query
    .orderBy(desc(userTable.createdAt))
    .limit(limit)

  const adminCountRow = await db
    .select({ count: sql<number>`count(1)` })
    .from(userTable)
    .where(and(eq(userTable.roleKey, 'admin'), ne(userTable.status, 'deleted')))
    .get()
  const adminCount = Number(adminCountRow?.count ?? 0)

  const enriched = items.map((item: any) => ({
    ...item,
    canDelete: !(item.roleKey === 'admin' && item.status !== 'deleted' && adminCount <= 1)
  }))

  return { items: enriched }
})
