import { readBody } from 'h3'
import { setAuthSession, isAdminLoginAllowed, isAdminLoginAllowedDb, getAdminUserByEmail } from '../../utils/auth'
import { badRequest, unauthorized } from '../../utils/http'
import { getTenantKey } from '../../utils/tenant'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ email?: string; password?: string }>(event)
  const email = (body?.email ?? '').trim().toLowerCase()
  const password = body?.password ?? ''

  if (!email || !password) throw badRequest('Missing email/password')
  const allowedDb = await isAdminLoginAllowedDb(event, email, password)
  if (!allowedDb && !isAdminLoginAllowed(email, password)) throw unauthorized('Invalid credentials')

  const adminUser = await getAdminUserByEmail(event, email)
  const sub = adminUser ? `user:${adminUser.id}` : `admin:${email}`

  await setAuthSession(event, {
    sub,
    email,
    role: 'admin',
    tenantKey: getTenantKey(event)
  })

  return { ok: true }
})
