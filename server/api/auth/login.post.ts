import { readBody } from 'h3'
import { setAuthSession, isAdminLoginAllowed } from '../../utils/auth'
import { badRequest, unauthorized } from '../../utils/http'
import { getTenantKey } from '../../utils/tenant'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ email?: string; password?: string }>(event)
  const email = (body?.email ?? '').trim().toLowerCase()
  const password = body?.password ?? ''

  if (!email || !password) throw badRequest('Missing email/password')
  if (!isAdminLoginAllowed(email, password)) throw unauthorized('Invalid credentials')

  await setAuthSession(event, {
    sub: `admin:${email}`,
    email,
    role: 'admin',
    tenantKey: getTenantKey(event)
  })

  return { ok: true }
})
