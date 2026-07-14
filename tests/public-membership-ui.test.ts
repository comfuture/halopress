import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')

async function readProjectFile(path: string) {
  return await readFile(resolve(root, path), 'utf8')
}

describe('public membership UI contracts', () => {
  it('provides public login fields with browser-friendly autocomplete and an honest recovery limitation', async () => {
    const login = await readProjectFile('app/pages/login.vue')

    expect(login).toContain(`definePageMeta({ layout: 'default' })`)
    expect(login).toContain('<UFormField label="Email" name="email" required>')
    expect(login).toMatch(/<UInput[^>]*type="email"[^>]*autocomplete="email"/)
    expect(login).toContain('<UFormField label="Password" name="password" required>')
    expect(login).toMatch(/<UInput[^>]*type="password"[^>]*autocomplete="current-password"/)
    expect(login).toContain('No self-service password recovery yet')
    expect(login).not.toMatch(/to="[^"]*(forgot|reset-password)/)
  })

  it('provides public signup fields, invitation autocomplete, and recovery and verification limitations', async () => {
    const signup = await readProjectFile('app/pages/signup.vue')

    expect(signup).toContain(`definePageMeta({ layout: 'default' })`)
    expect(signup).toMatch(/<UInput[^>]*type="email"[^>]*autocomplete="email"/)
    expect(signup.match(/autocomplete="new-password"/g)).toHaveLength(2)
    expect(signup).toContain('name="confirmPassword"')
    expect(signup).toContain('autocomplete="one-time-code"')
    expect(signup).toContain('Recovery and verification email are not configured')
    expect(signup).toContain('password reset and verification email delivery are not yet available')
  })

  it('shows session and logout affordances while restricting Desk actions to staff admins', async () => {
    const layout = await readProjectFile('app/layouts/default.vue')

    expect(layout).toContain('const { data: session, status, signOut } = useAuth()')
    expect(layout).toContain(`session.value?.user?.role === 'admin' && session.value.user.accountType === 'staff'`)
    expect(layout).toContain(`if (isAdmin.value) actions.unshift({ label: 'Open Desk'`)
    expect(layout).toContain(`{ label: 'Log out'`)
    expect(layout).toContain(`signOut({ callbackUrl: '/' })`)
    expect(layout).toContain('<UButton v-if="isAdmin" to="/_desk"')
    expect(layout).toContain('<UButton to="/account/security"')
  })

  it('redirects authenticated members away from Desk on client navigation', async () => {
    const middleware = await readProjectFile('app/middleware/desk-auth.global.ts')

    expect(middleware).toContain(`data.value.user.role === 'admin' && data.value.user.accountType === 'staff'`)
    expect(middleware).toMatch(/data\.value\.user\.role === 'admin'[\s\S]*?await navigateTo\('\/'\)/)
    expect(middleware).toContain(`session.user.role !== 'admin' || session.user.accountType !== 'staff'`)
    expect(middleware).toContain(`return await navigateTo('/')`)
  })

  it('requires explicit password reauthentication before linking Google by stable identity', async () => {
    const security = await readProjectFile('app/pages/account/security.vue')

    expect(security).toContain('Matching email alone never links accounts.')
    expect(security).toContain('<UFormField label="Current password" name="password" required>')
    expect(security).toMatch(/<UInput[^>]*type="password"[^>]*autocomplete="current-password"/)
    expect(security).toContain('Reauthenticate and connect Google')
    expect(security).toContain(`'/api/account/link/google'`)
    expect(security).toContain(`signIn('google'`)
    expect(security).toContain(`provider's stable account identity`)
  })
})
