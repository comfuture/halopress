import type { JWT } from 'next-auth/jwt'

export type AuthSession = {
  user: {
    id?: string
    email?: string
    name?: string
    role?: 'admin' | 'user' | 'anonymous'
    tenantKey?: string
  }
  expires?: string
} | null

export function hasSecureAuthSessionCookie(cookies: Record<string, string | undefined>) {
  return Object.keys(cookies).some(name => name.startsWith('__Secure-next-auth.session-token'))
}

export function authSessionFromToken(token: JWT | null): AuthSession {
  if (!token) return null
  return {
    user: {
      id: typeof token.id === 'string' ? token.id : undefined,
      email: typeof token.email === 'string' ? token.email : undefined,
      name: typeof token.name === 'string' ? token.name : undefined,
      role: token.role === 'admin' || token.role === 'user' || token.role === 'anonymous'
        ? token.role
        : undefined,
      tenantKey: typeof token.tenantKey === 'string' ? token.tenantKey : undefined
    },
    expires: typeof token.exp === 'number' ? new Date(token.exp * 1000).toISOString() : undefined
  }
}
