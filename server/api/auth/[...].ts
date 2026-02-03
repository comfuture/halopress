import { AsyncLocalStorage } from 'node:async_hooks'
import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'
import { NuxtAuthHandler } from '#auth'
import { createError, defineEventHandler, getRequestURL } from 'h3'
import { eq, or } from 'drizzle-orm'

import { getDb } from '../../db/db'
import { user as userTable } from '../../db/schema'
import { verifyPassword } from '../../utils/password'
import { resolveCredentialsEnabled, resolveOAuthProviderConfig } from '../../utils/oauth'
import { getInstallStatus } from '../../utils/install'
import { getTenantKey } from '../../utils/tenant'

type CredentialInput = {
  identifier?: string
  email?: string
  username?: string
  password?: string
}

type AuthHandler = ReturnType<typeof NuxtAuthHandler>
type AuthProviderConfig = {
  credentialsEnabled: boolean
  googleConfig: {
    enabled: boolean
    clientId?: string | null
    clientSecret?: string | null
  }
}

const authEventStorage = new AsyncLocalStorage<any>()

function getAuthEvent() {
  return authEventStorage.getStore()
}

function resolveTenantKey() {
  const event = getAuthEvent()
  if (!event) return 'local'
  return getTenantKey(event)
}

let cachedAuthHandler: AuthHandler | null = null
let cachedAuthHandlerKey: string | null = null

async function loadAuthProviderConfig(event: Parameters<AuthHandler>[0]): Promise<AuthProviderConfig> {
  const credentialsEnabled = await resolveCredentialsEnabled(event)
  const googleConfig = await resolveOAuthProviderConfig('google', event)
  return {
    credentialsEnabled,
    googleConfig: {
      enabled: Boolean(googleConfig.enabled),
      clientId: googleConfig.clientId ?? null,
      clientSecret: googleConfig.clientSecret ?? null
    }
  }
}

function buildAuthHandlerKey(config: AuthProviderConfig) {
  return JSON.stringify({
    credentialsEnabled: config.credentialsEnabled,
    googleConfig: {
      enabled: config.googleConfig.enabled,
      clientId: config.googleConfig.clientId,
      clientSecret: config.googleConfig.clientSecret
    }
  })
}

async function buildAuthHandler(config: AuthProviderConfig) {
  const { credentialsEnabled, googleConfig } = config
  const oauthProviders: any[] = []

  if (googleConfig.enabled) {
    if (googleConfig.clientId && googleConfig.clientSecret) {
      oauthProviders.push(
        // @ts-expect-error Use .default here for it to work during SSR.
        GoogleProvider.default({
          clientId: googleConfig.clientId,
          clientSecret: googleConfig.clientSecret
        })
      )
    } else {
      console.warn('[auth] Google OAuth enabled but missing clientId/clientSecret; skipping provider')
    }
  }

  const providers: any[] = []

  if (credentialsEnabled) {
    providers.push(
      // @ts-expect-error Use .default here for it to work during SSR.
      CredentialsProvider.default({
        name: 'Credentials',
        credentials: {
          identifier: { label: 'Email or username', type: 'text' },
          password: { label: 'Password', type: 'password' }
        },
        async authorize(credentials: Record<string, string> | undefined, req: { headers?: Record<string, string | string[] | undefined> }) {
          const authEvent = getAuthEvent()
          const input = credentials as CredentialInput | null
          const rawIdentifier = (input?.identifier || input?.email || input?.username || '').trim()
          const identifier = rawIdentifier.includes('@') ? rawIdentifier.toLowerCase() : rawIdentifier
          const password = input?.password ?? ''

          if (!identifier || !password) return null

          const rawHost = req?.headers?.host
          const host = Array.isArray(rawHost) ? (rawHost[0] ?? 'local') : rawHost || 'local'
          const tenantKey = host.split(':')[0] || 'local'

          let row: {
            id: string
            email: string
            name: string | null
            roleKey: string
            status: string
            passwordHash: string | null
            passwordSalt: string | null
          } | undefined

          try {
            const db = await getDb(authEvent)
            const user = await db
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

            row = user?.[0]
          } catch (error) {
            if (isMissingUserTableError(error)) return null
            throw error
          }

          if (!row || row.roleKey !== 'admin' || row.status !== 'active') return null
          if (!row.passwordHash || !row.passwordSalt) return null
          const ok = await verifyPassword(password, row.passwordHash, row.passwordSalt)
          if (!ok) return null

          return {
            id: row.id,
            email: row.email,
            name: row.name || row.email,
            role: row.roleKey,
            tenantKey
          }
        }
      })
    )
  }

  providers.push(...oauthProviders)

  return NuxtAuthHandler({
    secret: useRuntimeConfig().authSecret,
    session: {
      strategy: 'jwt'
    },
    pages: {
      signIn: '/_desk/login'
    },
    providers,
    callbacks: {
      async signIn({ user, account }) {
        const authEvent = getAuthEvent()
        if (account?.provider === 'credentials') return true

        const email = (user?.email || '').trim().toLowerCase()
        if (!email) return false

        try {
          const db = await getDb(authEvent)
          const row = await db
            .select({
              id: userTable.id,
              email: userTable.email,
              roleKey: userTable.roleKey,
              status: userTable.status
            })
            .from(userTable)
            .where(eq(userTable.email, email))
            .get()
          if (!row || row.roleKey !== 'admin' || row.status !== 'active') return false
        } catch (error) {
          if (isMissingUserTableError(error)) return false
          throw error
        }

        return true
      },
      async jwt({ token, user, account }) {
        if (user) {
          token.id = user.id
          token.role = (user as any).role
          token.tenantKey = (user as any).tenantKey
          token.email = user.email
          token.name = user.name
        }
        if (account?.provider && account.provider !== 'credentials') {
          const authEvent = getAuthEvent()
          const tenantKey = authEvent ? getTenantKey(authEvent) : resolveTenantKey()
          token.tenantKey = tenantKey
          const email = (token.email || user?.email || '').trim().toLowerCase()
          if (email) {
            try {
              const db = await getDb(authEvent)
              const row = await db
                .select({
                  id: userTable.id,
                  email: userTable.email,
                  name: userTable.name,
                  roleKey: userTable.roleKey,
                  status: userTable.status
                })
                .from(userTable)
                .where(eq(userTable.email, email))
                .get()
              if (row && row.roleKey === 'admin' && row.status === 'active') {
                token.id = row.id
                token.role = row.roleKey
                token.email = row.email
                token.name = row.name || row.email
              }
            } catch (error) {
              if (!isMissingUserTableError(error)) throw error
            }
          }
        }
        return token
      },
      session({ session, token }) {
        return {
          ...session,
          user: {
            ...session.user,
            id: token.id as string | undefined,
            email: token.email as string | undefined,
            name: token.name as string | undefined,
            role: token.role as 'admin' | 'user' | 'anonymous' | undefined,
            tenantKey: token.tenantKey as string | undefined
          }
        }
      }
    }
  })
}

export default defineEventHandler(async (event) => {
  const installDb = await getDb(event)
  const installStatus = await getInstallStatus(installDb)
  if (!installStatus.ready) {
    const path = getRequestURL(event).pathname
    if (path.endsWith('/session')) return { user: null }
    if (path.endsWith('/providers')) return {}
    if (path.endsWith('/csrf')) return { csrfToken: '' }
    throw createError({ statusCode: 503, statusMessage: 'Auth not ready' })
  }

  const config = await loadAuthProviderConfig(event)
  const configKey = buildAuthHandlerKey(config)
  if (!cachedAuthHandler || cachedAuthHandlerKey !== configKey) {
    cachedAuthHandler = await buildAuthHandler(config)
    cachedAuthHandlerKey = configKey
  }
  return authEventStorage.run(event, () => cachedAuthHandler!(event))
})

function isMissingUserTableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('no such table: user')
    || message.includes('relation "user" does not exist')
}
