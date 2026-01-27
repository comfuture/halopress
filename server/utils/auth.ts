import { SignJWT, jwtVerify } from 'jose'
import type { H3Event } from 'h3'
import { getCookie, setCookie } from 'h3'
import { useRuntimeConfig } from '#imports'
import { eq } from 'drizzle-orm'

import { unauthorized } from './http'
import { getTenantKey } from './tenant'
import { getDb } from '../db/db'
import { user as userTable } from '../db/schema'
import { verifyPassword } from './password'

const SESSION_COOKIE = 'hp_session'

export type SessionPayload = {
  sub: string
  email: string
  role: 'admin' | 'user' | 'anonymous'
  tenantKey: string
}

function getSecret() {
  const config = useRuntimeConfig()
  const secret = config.authSecret as string | undefined
  if (!secret) throw new Error('Missing runtimeConfig.authSecret')
  return new TextEncoder().encode(secret)
}

export async function createSessionToken(payload: SessionPayload, ttlSeconds = 60 * 60 * 24 * 7) {
  const now = Math.floor(Date.now() / 1000)
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(getSecret())
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    const p = payload as unknown as SessionPayload
    if (!p?.sub || !p?.email || !p?.role || !p?.tenantKey) return null
    return p
  } catch {
    return null
  }
}

export async function getAuthSession(event: H3Event): Promise<SessionPayload | null> {
  const token = getCookie(event, SESSION_COOKIE)
  if (!token) return null
  return await verifySessionToken(token)
}

export async function requireAdmin(event: H3Event): Promise<SessionPayload> {
  const session = await getAuthSession(event)
  if (!session) throw unauthorized()
  if (session.role !== 'admin') throw unauthorized()
  const tenantKey = getTenantKey(event)
  if (session.tenantKey !== tenantKey) throw unauthorized('Tenant mismatch')
  return session
}

export async function setAuthSession(event: H3Event, session: SessionPayload) {
  const token = await createSessionToken(session)
  const isProd = process.env.NODE_ENV === 'production'
  setCookie(event, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    path: '/'
  })
}

export function clearAuthSession(event: H3Event) {
  setCookie(event, SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0
  })
}

export function isAdminLoginAllowed(email: string, password: string) {
  const config = useRuntimeConfig()
  const adminEmail = (config.adminEmail as string | undefined) ?? ''
  const adminPassword = (config.adminPassword as string | undefined) ?? ''
  return email === adminEmail && password === adminPassword
}

export async function getAdminUserByEmail(event: H3Event, email: string) {
  const db = await getDb(event)
  try {
    const rows = await db
      .select({
        id: userTable.id,
        email: userTable.email,
        roleKey: userTable.roleKey,
        passwordHash: userTable.passwordHash,
        passwordSalt: userTable.passwordSalt
      })
      .from(userTable)
      .where(eq(userTable.email, email))
      .limit(1)
    const user = rows?.[0]
    if (!user || user.roleKey !== 'admin') return null
    return user
  } catch {
    return null
  }
}

export async function isAdminLoginAllowedDb(event: H3Event, email: string, password: string) {
  const user = await getAdminUserByEmail(event, email)
  if (!user?.passwordHash || !user?.passwordSalt) return false
  return await verifyPassword(password, user.passwordHash, user.passwordSalt)
}
