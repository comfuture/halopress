import CredentialsProvider from 'next-auth/providers/credentials'
import { NuxtAuthHandler } from '#auth'
import { eq, or } from 'drizzle-orm'

import { getDb } from '../../db/db'
import { user as userTable } from '../../db/schema'
import { verifyPassword } from '../../utils/password'

type CredentialInput = {
  identifier?: string
  email?: string
  username?: string
  password?: string
}

export default NuxtAuthHandler({
  secret: useRuntimeConfig().authSecret,
  session: {
    strategy: 'jwt'
  },
  pages: {
    signIn: '/_desk/login'
  },
  providers: [
    // @ts-expect-error Use .default here for it to work during SSR.
    CredentialsProvider.default({
      name: 'Credentials',
      credentials: {
        identifier: { label: 'Email or username', type: 'text' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials: Record<string, string> | undefined, req: { headers?: Record<string, string | string[] | undefined> }) {
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
          const db = await getDb()
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
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as any).role
        token.tenantKey = (user as any).tenantKey
        token.email = user.email
        token.name = user.name
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

function isMissingUserTableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('no such table: user')
    || message.includes('relation "user" does not exist')
}
