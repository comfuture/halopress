import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  externalIdentity,
  membershipInvitation,
  registrationRateLimit,
  user
} from '../server/db/schema'
import { resolveGoogleIdentity } from '../server/utils/external-identities'
import { runMigrations, seedRoles } from '../server/utils/install'
import {
  consumeRegistrationRateLimit,
  createMembershipInvitation,
  registerPasswordMember
} from '../server/utils/member-registration'
import { getMembershipSettings, updateMembershipSettings } from '../server/utils/membership'
import { getActiveAuthUser } from '../server/utils/auth-user'
import { createTestSqliteDb } from './fixtures/sqlite'

const dbState = vi.hoisted(() => ({ current: null as any }))
vi.mock('../server/db/db', () => ({ getDb: vi.fn(async () => dbState.current) }))

const event = {
  context: {},
  node: { req: { headers: { host: 'localhost' }, socket: { remoteAddress: '127.0.0.1' } } }
} as any
let fixture: Awaited<ReturnType<typeof createTestSqliteDb>>

beforeEach(async () => {
  fixture = await createTestSqliteDb()
  dbState.current = fixture.db
  await runMigrations(fixture.db)
  await seedRoles(fixture.db)
})

afterEach(() => {
  fixture.close()
  dbState.current = null
})

describe('public membership policy and password registration', () => {
  it('keeps registration disabled by default and persists one typed policy value', async () => {
    await expect(getMembershipSettings(event)).resolves.toEqual({ mode: 'disabled', defaultRole: 'user' })
    await expect(registerPasswordMember(event, {
      email: 'member@example.com',
      password: 'correct horse battery staple'
    })).rejects.toMatchObject({ statusCode: 403 })

    await updateMembershipSettings(event, { mode: 'open', defaultRole: 'user' }, 'admin-1')
    await expect(getMembershipSettings(event)).resolves.toEqual({ mode: 'open', defaultRole: 'user' })
  })

  it('normalizes canonical email, rejects case duplicates, and creates public member accounts', async () => {
    await updateMembershipSettings(event, { mode: 'open', defaultRole: 'user' }, 'admin-1')
    const created = await registerPasswordMember(event, {
      email: '  Member@Example.COM ',
      name: 'Member',
      password: 'correct horse battery staple'
    })
    expect(created).toMatchObject({ email: 'member@example.com', status: 'active', role: 'user' })
    const row = await fixture.db.select().from(user).where(eq(user.id, created.id)).get()
    expect(row).toMatchObject({ email: 'member@example.com', accountType: 'member', status: 'active' })

    await expect(registerPasswordMember(event, {
      email: 'MEMBER@example.com',
      password: 'a different secure password'
    })).rejects.toMatchObject({ statusCode: 409 })
  })

  it('creates pending accounts in approval mode and revokes them for auth refresh until activated', async () => {
    await updateMembershipSettings(event, { mode: 'approval', defaultRole: 'user' }, 'admin-1')
    const created = await registerPasswordMember(event, {
      email: 'pending@example.com',
      password: 'correct horse battery staple'
    })
    expect(created.status).toBe('pending')
    await expect(getActiveAuthUser(fixture.db, created.id)).resolves.toBeNull()

    await fixture.db.update(user).set({ status: 'active' }).where(eq(user.id, created.id))
    await expect(getActiveAuthUser(fixture.db, created.id)).resolves.toMatchObject({
      id: created.id,
      role: 'user',
      accountType: 'member'
    })
    await fixture.db.update(user).set({ status: 'suspended' }).where(eq(user.id, created.id))
    await expect(getActiveAuthUser(fixture.db, created.id)).resolves.toBeNull()
  })

  it('issues hashed email-bound invitations and consumes them only once', async () => {
    await updateMembershipSettings(event, { mode: 'invite', defaultRole: 'user' }, 'admin-1')
    await fixture.db.insert(user).values({
      id: 'admin-1', email: 'admin@example.com', name: 'Admin', accountType: 'staff', roleKey: 'admin', status: 'active', createdAt: new Date()
    })
    const invitation = await createMembershipInvitation(event, { email: 'Invitee@Example.com' }, 'admin-1')
    const stored = await fixture.db.select().from(membershipInvitation).get()
    expect(stored).toMatchObject({ email: 'invitee@example.com', status: 'pending' })
    expect(stored.tokenHash).not.toContain(invitation.code)

    await expect(registerPasswordMember(event, {
      email: 'invitee@example.com',
      password: 'correct horse battery staple',
      inviteCode: 'wrong'
    })).rejects.toMatchObject({ statusCode: 403 })

    const created = await registerPasswordMember(event, {
      email: 'invitee@example.com',
      password: 'correct horse battery staple',
      inviteCode: invitation.code
    })
    expect(created.status).toBe('active')
    await expect(fixture.db.select().from(membershipInvitation).get()).resolves.toMatchObject({
      status: 'used', usedBy: created.id
    })
  })

  it('uses atomic database counters for registration rate limits', async () => {
    const keys = ['ip-bucket', 'email-bucket']
    const now = new Date('2026-07-14T00:01:00.000Z')
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await consumeRegistrationRateLimit(fixture.db, keys, now)
    }
    await expect(consumeRegistrationRateLimit(fixture.db, keys, now)).rejects.toMatchObject({
      statusCode: 429
    })
    const rows = await fixture.db.select().from(registrationRateLimit)
    expect(rows.find(row => row.bucketKey === 'ip-bucket')?.attemptCount).toBe(6)
  })
})

describe('stable external identities', () => {
  it('provisions only verified Google subjects and keeps subject ownership across email changes', async () => {
    await updateMembershipSettings(event, { mode: 'open', defaultRole: 'user' }, 'admin-1')
    await expect(resolveGoogleIdentity(event, {
      subject: 'google-sub-1', email: 'google@example.com', emailVerified: false
    })).rejects.toMatchObject({ code: 'unverified_email' })

    const created = await resolveGoogleIdentity(event, {
      subject: 'google-sub-1', email: 'google@example.com', emailVerified: true
    })
    expect(created).toMatchObject({ email: 'google@example.com', accountType: 'member', role: 'user' })
    const returning = await resolveGoogleIdentity(event, {
      subject: 'google-sub-1', email: 'changed@example.com', emailVerified: true
    })
    expect(returning.id).toBe(created.id)
    const withoutRepeatedClaims = await resolveGoogleIdentity(event, {
      subject: 'google-sub-1', email: '', emailVerified: false
    })
    expect(withoutRepeatedClaims.id).toBe(created.id)
    await expect(fixture.db.select().from(externalIdentity).get()).resolves.toMatchObject({
      subject: 'google-sub-1', userId: created.id, emailAtLink: 'changed@example.com', emailVerified: true
    })
  })

  it('rejects silent email linking and permits only an explicit target account', async () => {
    await fixture.db.insert(user).values({
      id: 'password-user',
      email: 'existing@example.com',
      name: 'Existing',
      accountType: 'member',
      roleKey: 'user',
      passwordHash: 'hash',
      passwordSalt: 'salt',
      status: 'active',
      createdAt: new Date()
    })
    await updateMembershipSettings(event, { mode: 'open', defaultRole: 'user' }, 'admin-1')
    await expect(resolveGoogleIdentity(event, {
      subject: 'google-sub-existing', email: 'existing@example.com', emailVerified: true
    })).rejects.toMatchObject({ code: 'explicit_link_required' })

    const linked = await resolveGoogleIdentity(event, {
      subject: 'google-sub-existing',
      email: 'existing@example.com',
      emailVerified: true,
      linkUserId: 'password-user'
    })
    expect(linked.id).toBe('password-user')
  })
})

describe('0006 canonical email migration', () => {
  it('normalizes legacy email and enforces unique canonical values', async () => {
    const row = await fixture.db.select().from(user).limit(1)
    expect(row).toEqual([])
    await fixture.db.insert(user).values({
      id: 'canonical', email: 'canonical@example.com', accountType: 'member', roleKey: 'user', status: 'active', createdAt: new Date()
    })
    await expect(fixture.db.insert(user).values({
      id: 'duplicate', email: 'canonical@example.com', accountType: 'member', roleKey: 'user', status: 'active', createdAt: new Date()
    })).rejects.toThrow()
  })

  it('contains an explicit pre-index collision guard without modifying generated metadata by hand', async () => {
    const root = resolve(import.meta.dirname, '..')
    const sql = await readFile(resolve(root, 'server/db/migrations/0006_add_public_member_identities.sql'), 'utf8')
    expect(sql).toContain('_halopress_email_normalization_guard')
    expect(sql.indexOf('SELECT lower(trim(`email`))')).toBeLessThan(sql.indexOf('UPDATE `user` SET `email` = lower(trim(`email`))'))
    expect(sql.indexOf('UPDATE `user` SET `email` = lower(trim(`email`))')).toBeLessThan(sql.indexOf('idx_user_email_unique'))
  })
})
