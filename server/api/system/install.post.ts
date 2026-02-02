import { readBody } from 'h3'
import { getDb } from '../../db/db'
import { badRequest, notFound, unauthorized } from '../../utils/http'
import { getAdminUserByIdentifier, isAdminLoginAllowedDb } from '../../utils/auth'
import { resolveEncryptionKey } from '../../utils/oauth'
import { upsertSetting } from '../../utils/settings'
import {
  ensureAdminUser,
  ensureBootstrapSchema,
  getInstallStatus,
  runMigrations,
  seedRoles,
  type UserRoleSeed
} from '../../utils/install'

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    email?: string
    name?: string
    password?: string
    sampleData?: boolean
    auth?: {
      credentialsEnabled?: boolean
      googleEnabled?: boolean
      googleClientId?: string
      googleClientSecret?: string
    }
    roles?: Array<{ roleKey?: string; title?: string; level?: number }>
  }>(event)
  const email = (body?.email ?? '').trim().toLowerCase()
  const name = (body?.name ?? '').trim()
  const password = body?.password ?? ''
  const sampleData = body?.sampleData === true
  const auth = body?.auth
  const credentialsEnabled = auth?.credentialsEnabled !== false
  const googleEnabled = auth?.googleEnabled === true
  const googleClientIdInput = (auth?.googleClientId ?? '').trim()
  const googleClientSecretInput = (auth?.googleClientSecret ?? '').trim()
  const envGoogleClientId = (process.env.NUXT_OAUTH_GOOGLE_CLIENT_ID ?? '').trim()
  const envGoogleClientSecret = (process.env.NUXT_OAUTH_GOOGLE_CLIENT_SECRET ?? '').trim()
  const encryptionSecret = resolveEncryptionKey('google')
  const roles = normalizeRoles(body?.roles)

  if (!email || !password) throw badRequest('Missing admin credentials')
  if (!credentialsEnabled && !googleEnabled) throw badRequest('At least one auth method must be enabled')
  if (googleEnabled && !encryptionSecret) {
    throw badRequest('NUXT_SECRET or NUXT_OAUTH_GOOGLE_ENCRYPTION_KEY is required to enable Google OAuth')
  }

  const db = await getDb(event)
  const status = await getInstallStatus(db)
  if (status.ready) throw notFound()

  await runMigrations(db)
  await seedRoles(db, roles)

  await upsertSetting({
    key: 'auth.oauth.credentials.enabled',
    value: credentialsEnabled ? 'true' : 'false',
    valueType: 'boolean',
    groupKey: 'auth.oauth',
    updatedBy: 'system:install'
  }, event)

  await upsertSetting({
    key: 'auth.oauth.google.enabled',
    value: googleEnabled ? 'true' : 'false',
    valueType: 'boolean',
    groupKey: 'auth.oauth',
    updatedBy: 'system:install'
  }, event)

  if (googleEnabled) {
    const googleClientId = googleClientIdInput || envGoogleClientId
    const googleClientSecret = googleClientSecretInput || envGoogleClientSecret

    if (!googleClientId || !googleClientSecret) {
      throw badRequest('Missing Google OAuth client ID or secret')
    }

    await upsertSetting({
      key: 'auth.oauth.google.clientId',
      value: googleClientId,
      valueType: 'string',
      groupKey: 'auth.oauth',
      updatedBy: 'system:install'
    }, event)

    await upsertSetting({
      key: 'auth.oauth.google.clientSecret',
      value: googleClientSecret,
      valueType: 'string',
      isEncrypted: true,
      encryptionKey: encryptionSecret,
      groupKey: 'auth.oauth',
      updatedBy: 'system:install'
    }, event)
  }

  const freshStatus = await getInstallStatus(db)

  let sub = 'system:install'
  if ((freshStatus.userCount ?? 0) > 0) {
    const allowed = await isAdminLoginAllowedDb(event, email, password)
    if (!allowed) throw unauthorized('Invalid admin credentials')
    const adminUser = await getAdminUserByIdentifier(event, email)
    sub = adminUser ? `user:${adminUser.id}` : `admin:${email}`
  } else {
    const adminId = await ensureAdminUser(db, { email, name, password })
    if (!adminId) throw badRequest('Admin user already exists')
    sub = `user:${adminId}`
  }

  if (sampleData) {
    await ensureBootstrapSchema(db, sub)
  }

  return { ok: true }
})

function normalizeRoles(input: Array<{ roleKey?: string; title?: string; level?: number }> | undefined): UserRoleSeed[] {
  const roles = (input ?? []).map((role) => {
    const roleKey = (role?.roleKey ?? '').trim().toLowerCase()
    const title = (role?.title ?? '').trim()
    const level = Number(role?.level)
    return { roleKey, title, level }
  }).filter(role => role.roleKey)

  if (!roles.length) {
    return [
      { roleKey: 'admin', title: 'Admin', level: 100 },
      { roleKey: 'user', title: 'User', level: 50 },
      { roleKey: 'anonymous', title: 'Anonymous', level: 0 }
    ]
  }

  const seen = new Set<string>()
  for (const role of roles) {
    if (seen.has(role.roleKey)) {
      throw badRequest(`Duplicate role key: ${role.roleKey}`)
    }
    seen.add(role.roleKey)
    if (!Number.isFinite(role.level) || role.level < 0 || role.level > 100) {
      throw badRequest(`Invalid level for role: ${role.roleKey}`)
    }
    if (!role.title) {
      role.title = role.roleKey
    }
  }

  if (!seen.has('admin') || !seen.has('anonymous')) {
    throw badRequest('Admin and anonymous roles are required')
  }

  return roles
}
