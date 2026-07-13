import type { H3Event } from 'h3'
import { and, eq } from 'drizzle-orm'

import { getDb } from '../db/db'
import { schemaRole as schemaRoleTable } from '../db/schema'
import { getAuthSession, requireAdmin } from './auth'
import { badRequest, forbidden } from './http'

export type SchemaPermissionAction = 'read' | 'write' | 'admin'

export type SchemaPermission = {
  roleKey: string
  canRead: boolean
  canWrite: boolean
  canAdmin: boolean
}

function isAdminRole(roleKey: string) {
  return roleKey === 'admin'
}

export async function getSchemaRoleKey(event: H3Event) {
  const session = await getAuthSession(event)
  const roleKey = (session?.user as { role?: string } | undefined)?.role || 'anonymous'

  if (isAdminRole(roleKey)) {
    await requireAdmin(event)
  }

  return roleKey
}

export async function getSchemaPermission(event: H3Event, schemaKey: string): Promise<SchemaPermission> {
  if (!schemaKey) throw badRequest('Missing schema key')
  const roleKey = await getSchemaRoleKey(event)

  if (isAdminRole(roleKey)) {
    return { roleKey, canRead: true, canWrite: true, canAdmin: true }
  }

  const db = await getDb(event)
  const row = await db
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
    canRead: !!row?.canRead,
    canWrite: !!row?.canWrite,
    canAdmin: !!row?.canAdmin
  }
}

export function hasSchemaPermission(permission: SchemaPermission, action: SchemaPermissionAction) {
  if (action === 'read') return permission.canRead || permission.canWrite || permission.canAdmin
  if (action === 'write') return permission.canWrite || permission.canAdmin
  return permission.canAdmin
}

export async function requireSchemaPermission(event: H3Event, schemaKey: string, action: SchemaPermissionAction) {
  const permission = await getSchemaPermission(event, schemaKey)
  if (!hasSchemaPermission(permission, action)) {
    throw forbidden('Permission denied')
  }
  return permission
}
