import { readBody } from 'h3'
import { getDb } from '../../db/db'
import { badRequest, notFound, unauthorized } from '../../utils/http'
import { getAdminUserByEmail, isAdminLoginAllowed, isAdminLoginAllowedDb, setAuthSession } from '../../utils/auth'
import { getTenantKey } from '../../utils/tenant'
import {
  ensureAdminUser,
  ensureBootstrapSchema,
  getInstallStatus,
  runMigrations,
  seedRoles
} from '../../utils/install'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ email?: string; name?: string; password?: string }>(event)
  const email = (body?.email ?? '').trim().toLowerCase()
  const name = (body?.name ?? '').trim()
  const password = body?.password ?? ''

  if (!email || !password) throw badRequest('Missing admin credentials')

  const db = await getDb(event)
  const status = await getInstallStatus(db)
  if (status.ready) throw notFound()

  await runMigrations(db)
  await seedRoles(db)

  const freshStatus = await getInstallStatus(db)

  let sub = 'system:install'
  if ((freshStatus.userCount ?? 0) > 0) {
    const allowed = (await isAdminLoginAllowedDb(event, email, password)) || isAdminLoginAllowed(email, password)
    if (!allowed) throw unauthorized('Invalid admin credentials')
    const adminUser = await getAdminUserByEmail(event, email)
    sub = adminUser ? `user:${adminUser.id}` : `admin:${email}`
  } else {
    const adminId = await ensureAdminUser(db, { email, name, password })
    if (!adminId) throw badRequest('Admin user already exists')
    sub = `user:${adminId}`
    await setAuthSession(event, {
      sub,
      email,
      role: 'admin',
      tenantKey: getTenantKey(event)
    })
  }

  await ensureBootstrapSchema(db, sub)

  return { ok: true }
})
