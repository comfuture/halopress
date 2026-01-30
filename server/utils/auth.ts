import type { H3Event } from 'h3'
import { eq, or } from 'drizzle-orm'
import { getServerSession } from '#auth'
import { useRuntimeConfig } from '#imports'

import { unauthorized } from './http'
import { getTenantKey } from './tenant'
import { getDb } from '../db/db'
import { user as userTable } from '../db/schema'
import { verifyPassword } from './password'

export type AuthSession = Awaited<ReturnType<typeof getServerSession>>

export async function getAuthSession(event: H3Event): Promise<AuthSession> {
  return await getServerSession(event)
}

export async function requireAdmin(event: H3Event) {
  const session = await getAuthSession(event)
  const user = session?.user as {
    id?: string
    email?: string
    name?: string
    role?: 'admin' | 'user' | 'anonymous'
    tenantKey?: string
  } | undefined

  if (!user) throw unauthorized()
  if (user.role !== 'admin') throw unauthorized()

  const tenantKey = getTenantKey(event)
  if (user.tenantKey && user.tenantKey !== tenantKey) {
    throw unauthorized('Tenant mismatch')
  }

  const userId = user.id
  if (userId && !userId.startsWith('admin:')) {
    const db = await getDb(event)
    const row = await db
      .select({ id: userTable.id, status: userTable.status })
      .from(userTable)
      .where(eq(userTable.id, userId))
      .get()
    if (!row || row.status !== 'active') throw unauthorized()
  }

  return session
}

export function isAdminLoginAllowed(email: string, password: string) {
  const config = useRuntimeConfig()
  const adminEmail = (config.adminEmail as string | undefined) ?? ''
  const adminPassword = (config.adminPassword as string | undefined) ?? ''
  return email === adminEmail && password === adminPassword
}

export async function getAdminUserByIdentifier(event: H3Event, identifier: string) {
  const db = await getDb(event)
  try {
    const rows = await db
      .select({
        id: userTable.id,
        email: userTable.email,
        name: userTable.name,
        roleKey: userTable.roleKey,
        status: userTable.status,
        passwordHash: userTable.passwordHash,
        passwordSalt: userTable.passwordSalt
      })
      .from(userTable)
      .where(or(eq(userTable.email, identifier), eq(userTable.name, identifier)))
      .limit(1)
    const user = rows?.[0]
    if (!user || user.roleKey !== 'admin' || user.status !== 'active') return null
    return user
  } catch (error) {
    if (isMissingUserTableError(error)) return null
    throw error
  }
}

export async function isAdminLoginAllowedDb(event: H3Event, identifier: string, password: string) {
  const user = await getAdminUserByIdentifier(event, identifier)
  if (!user?.passwordHash || !user?.passwordSalt) return false
  return await verifyPassword(password, user.passwordHash, user.passwordSalt)
}

function isMissingUserTableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('no such table: user')
    || message.includes('relation "user" does not exist')
}
