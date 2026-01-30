import { readBody } from 'h3'
import { getDb } from '../../db/db'
import { badRequest, notFound, unauthorized } from '../../utils/http'
import { getAdminUserByIdentifier, isAdminLoginAllowed, isAdminLoginAllowedDb } from '../../utils/auth'
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
    roles?: Array<{ roleKey?: string; title?: string; level?: number }>
  }>(event)
  const email = (body?.email ?? '').trim().toLowerCase()
  const name = (body?.name ?? '').trim()
  const password = body?.password ?? ''
  const sampleData = body?.sampleData === true
  const roles = normalizeRoles(body?.roles)

  if (!email || !password) throw badRequest('Missing admin credentials')

  const db = await getDb(event)
  const status = await getInstallStatus(db)
  if (status.ready) throw notFound()

  await runMigrations(db)
  await seedRoles(db, roles)

  const freshStatus = await getInstallStatus(db)

  let sub = 'system:install'
  if ((freshStatus.userCount ?? 0) > 0) {
    const allowed = (await isAdminLoginAllowedDb(event, email, password)) || isAdminLoginAllowed(email, password)
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
