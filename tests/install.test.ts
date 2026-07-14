import { and, eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import {
  content,
  contentListing,
  documentRevision,
  installation,
  publicationRevision,
  schema,
  user
} from '../server/db/schema'
import { installInputSchema } from '../server/utils/install-input'
import { publicationRevisionValues } from '../server/cms/publication'
import {
  hasStrongInstallToken,
  isAuthRuntimeReady,
  selectAuthSigningSecret
} from '../server/utils/install-token'
import {
  SETUP_SESSION_TTL_MILLISECONDS,
  createSetupSessionToken,
  getMissingCloudflareBindings,
  hashSetupSessionToken,
  isSameOriginSetupRequest
} from '../server/utils/install-session'
import {
  INSTALLATION_KEY,
  beginInstallation,
  completeInstallation,
  ensureAdminUser,
  ensureBootstrapSchema,
  failInstallation,
  getInstallStatus,
  getInstallationSessionAccess,
  getRuntimeInstallStatus,
  refreshInstallationSession,
  reserveInstallationSession,
  runMigrations,
  seedRoles
} from '../server/utils/install'
import { BOOTSTRAP_CONTENT_ID, BOOTSTRAP_PUBLICATION_REVISION_ID } from '../server/utils/bootstrap'
import { createTestSqliteDb } from './fixtures/sqlite'

const TEST_SIGNING_SECRET = 'test-signing-secret-0123456789abcdef'

async function createSetupSessionHash(token = createSetupSessionToken()) {
  return await hashSetupSessionToken(token, TEST_SIGNING_SECRET)
}

async function withDatabase(run: (db: any) => Promise<void>) {
  const fixture = await createTestSqliteDb()
  try {
    await run(fixture.db)
  } finally {
    fixture.close()
  }
}

describe('installation state', () => {
  it('prepares a clean local database during status lookup but leaves Cloudflare migrations deploy-owned', async () => {
    await withDatabase(async (localDb) => {
      expect(await getInstallStatus(localDb)).toMatchObject({
        ready: false,
        canInstall: false,
        phase: 'migration_required'
      })
      expect(await getRuntimeInstallStatus(localDb, { isCloudflareRuntime: false })).toMatchObject({
        ready: false,
        canInstall: true,
        phase: 'ready_for_setup'
      })
    })

    await withDatabase(async (cloudflareDb) => {
      expect(await getRuntimeInstallStatus(cloudflareDb, { isCloudflareRuntime: true })).toMatchObject({
        ready: false,
        canInstall: false,
        phase: 'migration_required'
      })
    })
  })

  it('requires the editorial revision table before reporting installation readiness', async () => {
    await withDatabase(async (db) => {
      await runMigrations(db)
      await db.run(sql.raw('DROP TABLE document_revision'))

      expect(await getInstallStatus(db)).toMatchObject({
        ready: false,
        canInstall: false,
        phase: 'migration_required',
        missingTables: ['document_revision']
      })
    })
  })

  it('does not report ready until the lease owner explicitly completes installation', async () => {
    await withDatabase(async (db) => {
      await runMigrations(db)
      expect(await getInstallStatus(db)).toMatchObject({
        ready: false,
        canInstall: true,
        phase: 'ready_for_setup'
      })

      const setupSessionHash = await createSetupSessionHash()
      expect(await reserveInstallationSession(db, setupSessionHash)).toBe(true)
      const claim = await beginInstallation(db, setupSessionHash)
      expect(claim).toBeTruthy()
      expect(await getInstallStatus(db)).toMatchObject({ ready: false, phase: 'installing' })

      await seedRoles(db)
      const adminId = await ensureAdminUser(db, {
        email: 'admin@example.com',
        name: 'Admin',
        password: 'correct horse battery staple'
      })
      expect(adminId).toBeTruthy()
      expect(await getInstallStatus(db)).toMatchObject({ ready: false, phase: 'installing' })

      await completeInstallation(db, claim!.leaseToken, `user:${adminId}`)
      expect(await getInstallStatus(db)).toMatchObject({
        ready: true,
        canInstall: false,
        phase: 'complete',
        userCount: 1
      })
    })
  })

  it('allows only one browser to reserve setup and rejects missing or wrong POST ownership', async () => {
    await withDatabase(async (db) => {
      await runMigrations(db)
      const firstSessionHash = await createSetupSessionHash()
      const secondSessionHash = await createSetupSessionHash()
      const reservations = await Promise.all([
        reserveInstallationSession(db, firstSessionHash),
        reserveInstallationSession(db, secondSessionHash)
      ])

      expect(reservations.filter(Boolean)).toHaveLength(1)
      expect(await db.select().from(installation)).toHaveLength(1)

      const ownerHash = reservations[0] ? firstSessionHash : secondSessionHash
      const otherHash = reservations[0] ? secondSessionHash : firstSessionHash
      expect(await getInstallationSessionAccess(db, ownerHash)).toMatchObject({ owned: true, locked: false })
      expect(await getInstallationSessionAccess(db, otherHash)).toMatchObject({ owned: false, locked: true })
      expect(await getInstallationSessionAccess(db, null)).toMatchObject({ owned: false, locked: true })
      expect(await beginInstallation(db, otherHash)).toBeNull()
    })
  })

  it('allows an expired setup reservation to be taken over by a new browser', async () => {
    await withDatabase(async (db) => {
      await runMigrations(db)
      const now = new Date('2026-07-13T00:00:00.000Z')
      const firstSessionHash = await createSetupSessionHash()
      const secondSessionHash = await createSetupSessionHash()
      expect(await reserveInstallationSession(db, firstSessionHash, now)).toBe(true)

      const afterExpiry = new Date(now.getTime() + SETUP_SESSION_TTL_MILLISECONDS + 1)
      expect(await reserveInstallationSession(db, secondSessionHash, afterExpiry)).toBe(true)
      expect(await getInstallationSessionAccess(db, firstSessionHash, afterExpiry)).toMatchObject({
        owned: false,
        locked: true
      })
      expect(await getInstallationSessionAccess(db, secondSessionHash, afterExpiry)).toMatchObject({
        owned: true,
        locked: false
      })
    })
  })

  it('releases a failed lease and resumes a partial installation without another admin', async () => {
    await withDatabase(async (db) => {
      await runMigrations(db)
      const setupSessionHash = await createSetupSessionHash()
      await reserveInstallationSession(db, setupSessionHash)
      const firstClaim = await beginInstallation(db, setupSessionHash)
      await seedRoles(db)
      const adminId = await ensureAdminUser(db, {
        email: 'admin@example.com',
        password: 'correct horse battery staple'
      })

      await failInstallation(db, firstClaim!.leaseToken, new Error('injected failure'))
      expect(await getInstallStatus(db)).toMatchObject({
        ready: false,
        canInstall: true,
        phase: 'resume_required',
        hasLastError: true
      })

      expect(await refreshInstallationSession(db, setupSessionHash)).toBe(true)
      const retryClaim = await beginInstallation(db, setupSessionHash)
      expect(retryClaim).toBeTruthy()
      expect(await db.select().from(user)).toHaveLength(1)
      await completeInstallation(db, retryClaim!.leaseToken, `user:${adminId}`)
    })
  })

  it('creates the bootstrap schema and welcome content idempotently', async () => {
    await withDatabase(async (db) => {
      await runMigrations(db)
      await seedRoles(db)

      expect(await ensureBootstrapSchema(db, 'user:admin')).toBe('article')
      const firstPublished = await db.select().from(content)
        .where(eq(content.id, BOOTSTRAP_CONTENT_ID)).get()
      expect(await ensureBootstrapSchema(db, 'user:admin')).toBe('article')

      expect(await db.select().from(schema)).toHaveLength(1)
      const contents = await db.select().from(content)
      expect(contents).toHaveLength(1)
      expect(contents[0]?.id).toBe(BOOTSTRAP_CONTENT_ID)
      expect(contents[0]).toMatchObject({
        status: 'published',
        publishedRevisionId: BOOTSTRAP_PUBLICATION_REVISION_ID
      })
      expect(contents[0]?.firstPublishedAt).toBeInstanceOf(Date)
      expect(contents[0]?.publishedAt).toBeInstanceOf(Date)
      expect(contents[0]?.publishedRevisionId).toBe(firstPublished?.publishedRevisionId)
      expect(contents[0]?.firstPublishedAt).toEqual(firstPublished?.firstPublishedAt)
      expect(contents[0]?.publishedAt).toEqual(firstPublished?.publishedAt)
      expect(await db.select().from(publicationRevision)).toHaveLength(1)
      expect(await db.select().from(publicationRevision).get()).toMatchObject({
        id: BOOTSTRAP_PUBLICATION_REVISION_ID,
        documentKind: 'content',
        documentId: BOOTSTRAP_CONTENT_ID,
        schemaKey: 'article',
        schemaVersion: 1
      })
      const revisions = await db.select().from(documentRevision)
      expect(revisions).toHaveLength(1)
      expect(revisions[0]).toMatchObject({
        documentKind: 'content',
        documentId: BOOTSTRAP_CONTENT_ID,
        schemaKey: 'article',
        revision: 1,
        action: 'create',
        status: 'published',
        schemaVersion: 1,
        createdBy: 'user:admin'
      })
      expect(JSON.parse(revisions[0]!.snapshotJson)).toMatchObject({ title: 'Welcome guide' })
      expect((await db.select().from(contentListing)).map(row => row.projectionScope).sort()).toEqual([
        'published',
        'working'
      ])
    })
  })

  it('rolls back bootstrap content when its initial revision cannot be created', async () => {
    await withDatabase(async (db) => {
      await runMigrations(db)
      await seedRoles(db)
      await db.run(sql.raw(`
        CREATE TRIGGER reject_bootstrap_revision
        BEFORE INSERT ON document_revision
        BEGIN
          SELECT RAISE(ABORT, 'injected revision failure');
        END
      `))

      await expect(ensureBootstrapSchema(db, 'user:admin')).rejects.toThrow()
      expect(await db.select().from(content).where(eq(content.id, BOOTSTRAP_CONTENT_ID))).toHaveLength(0)
      expect(await db.select().from(documentRevision)).toHaveLength(0)
    })
  })

  it('repairs a partial published bootstrap row without auto-publishing a draft', async () => {
    await withDatabase(async (db) => {
      await runMigrations(db)
      await seedRoles(db)
      await ensureBootstrapSchema(db, 'user:admin')
      await db.update(content).set({
        publishedRevisionId: null,
        firstPublishedAt: null,
        publishedAt: null
      }).where(eq(content.id, BOOTSTRAP_CONTENT_ID))
      await db.delete(publicationRevision)
      await db.delete(contentListing).where(and(
        eq(contentListing.contentId, BOOTSTRAP_CONTENT_ID),
        eq(contentListing.projectionScope, 'published')
      ))

      expect(await ensureBootstrapSchema(db, 'user:admin')).toBe('article')
      expect(await db.select().from(content).where(eq(content.id, BOOTSTRAP_CONTENT_ID)).get()).toMatchObject({
        status: 'published',
        publishedRevisionId: BOOTSTRAP_PUBLICATION_REVISION_ID
      })
      expect(await db.select().from(contentListing).where(and(
        eq(contentListing.contentId, BOOTSTRAP_CONTENT_ID),
        eq(contentListing.projectionScope, 'published')
      ))).toHaveLength(1)

      await db.update(content).set({
        status: 'draft',
        publishedRevisionId: null,
        publishedAt: null
      }).where(eq(content.id, BOOTSTRAP_CONTENT_ID))
      await db.delete(publicationRevision)
      await db.delete(contentListing).where(and(
        eq(contentListing.contentId, BOOTSTRAP_CONTENT_ID),
        eq(contentListing.projectionScope, 'published')
      ))

      expect(await ensureBootstrapSchema(db, 'user:admin')).toBe('article')
      expect(await db.select().from(content).where(eq(content.id, BOOTSTRAP_CONTENT_ID)).get()).toMatchObject({
        status: 'draft',
        publishedRevisionId: null
      })
      expect(await db.select().from(publicationRevision)).toHaveLength(0)
      expect(await db.select().from(contentListing).where(and(
        eq(contentListing.contentId, BOOTSTRAP_CONTENT_ID),
        eq(contentListing.projectionScope, 'published')
      ))).toHaveLength(0)
    })
  })

  it('preserves an existing valid bootstrap publication pointer', async () => {
    await withDatabase(async (db) => {
      await runMigrations(db)
      await seedRoles(db)
      await ensureBootstrapSchema(db, 'user:admin')
      const row = await db.select().from(content).where(eq(content.id, BOOTSTRAP_CONTENT_ID)).get()
      const republishedAt = new Date('2026-07-13T01:00:00.000Z')
      await db.insert(publicationRevision).values(publicationRevisionValues({
        id: 'welcome-guide-republished',
        documentKind: 'content',
        documentId: BOOTSTRAP_CONTENT_ID,
        schemaKey: 'article',
        schemaVersion: 1,
        content: { title: 'Republished welcome guide' },
        createdBy: 'user:admin',
        createdAt: republishedAt
      }))
      await db.update(content).set({
        publishedRevisionId: 'welcome-guide-republished',
        publishedAt: republishedAt
      }).where(eq(content.id, BOOTSTRAP_CONTENT_ID))

      expect(await ensureBootstrapSchema(db, 'user:admin')).toBe('article')
      expect(await db.select().from(content).where(eq(content.id, BOOTSTRAP_CONTENT_ID)).get()).toMatchObject({
        publishedRevisionId: 'welcome-guide-republished',
        firstPublishedAt: row?.firstPublishedAt,
        publishedAt: republishedAt
      })
      expect(await db.select().from(contentListing).where(and(
        eq(contentListing.contentId, BOOTSTRAP_CONTENT_ID),
        eq(contentListing.projectionScope, 'published')
      )).get()).toMatchObject({ title: 'Republished welcome guide' })
    })
  })

  it('backfills legacy databases with users and roles as complete', async () => {
    await withDatabase(async (db) => {
      await runMigrations(db)
      await db.delete(installation).where(sql`${installation.key} = ${INSTALLATION_KEY}`)
      await seedRoles(db)
      await ensureAdminUser(db, {
        email: 'legacy@example.com',
        password: 'correct horse battery staple'
      })

      await db.run(sql.raw('DELETE FROM __drizzle_migrations WHERE created_at >= 1783909586488 AND created_at < 1783943602176'))
      await db.run(sql.raw('DROP TABLE installation'))
      await runMigrations(db)

      expect(await getInstallStatus(db)).toMatchObject({
        ready: true,
        phase: 'complete',
        userCount: 1,
        roleCount: 3
      })
    })
  })
})

describe('installation input', () => {
  const validInput = {
    email: 'admin@example.com',
    name: 'Admin',
    password: 'correct horse battery staple'
  }

  it('normalizes a valid administrator payload', () => {
    const parsed = installInputSchema.parse({ ...validInput, email: ' ADMIN@Example.COM ' })
    expect(parsed.email).toBe('admin@example.com')
  })

  it.each([
    [{ ...validInput, email: 'not-an-email' }],
    [{ ...validInput, password: 'too-short' }],
    [{ ...validInput, auth: { credentialsEnabled: true, googleEnabled: false } }],
    [{ ...validInput, roles: [{ roleKey: 'admin', level: 100 }] }]
  ])('rejects invalid or unsupported setup input', (input) => {
    expect(installInputSchema.safeParse(input).success).toBe(false)
  })
})

describe('installation token', () => {
  it('requires a strong production runtime secret', () => {
    const token = '0123456789abcdef0123456789abcdef'
    expect(hasStrongInstallToken(token)).toBe(true)
    expect(hasStrongInstallToken('dev-secret-change-me')).toBe(false)
  })

  it('fails Cloudflare authentication closed after installation without a strong signing secret', async () => {
    await withDatabase(async (db) => {
      await runMigrations(db)
      const setupSessionHash = await createSetupSessionHash()
      await reserveInstallationSession(db, setupSessionHash)
      const claim = await beginInstallation(db, setupSessionHash)
      await seedRoles(db)
      const adminId = await ensureAdminUser(db, {
        email: 'admin@example.com',
        password: 'correct horse battery staple'
      })
      await completeInstallation(db, claim!.leaseToken, `user:${adminId}`)
      expect(await getInstallStatus(db)).toMatchObject({ ready: true, phase: 'complete' })

      expect(isAuthRuntimeReady(true, '')).toBe(false)
      expect(isAuthRuntimeReady(true, 'dev-secret-change-me')).toBe(false)
      expect(isAuthRuntimeReady(true, 'short-secret')).toBe(false)
      expect(isAuthRuntimeReady(true, '0123456789abcdef0123456789abcdef')).toBe(true)
      expect(isAuthRuntimeReady(false, 'dev-secret-change-me')).toBe(true)
    })
  })

  it('prefers a strong auth secret and otherwise falls back to a strong install token', () => {
    const strongAuthSecret = 'auth-secret-0123456789abcdef0123456789'
    const strongInstallToken = 'install-token-0123456789abcdef012345'

    expect(selectAuthSigningSecret(strongAuthSecret, strongInstallToken)).toBe(strongAuthSecret)
    expect(selectAuthSigningSecret('short-secret', strongInstallToken)).toBe(strongInstallToken)
    expect(selectAuthSigningSecret('dev-secret-change-me', strongInstallToken)).toBe(strongInstallToken)
    expect(selectAuthSigningSecret('short-secret', '')).toBe('short-secret')
  })
})

describe('browser setup session security', () => {
  it('stores only a hash and does not expose the browser token in status data', async () => {
    await withDatabase(async (db) => {
      await runMigrations(db)
      const token = createSetupSessionToken()
      const tokenHash = await createSetupSessionHash(token)
      const hashWithDifferentSecret = await hashSetupSessionToken(token, 'different-signing-secret-0123456789')
      expect(hashWithDifferentSecret).not.toBe(tokenHash)
      await reserveInstallationSession(db, tokenHash)

      const row = (await db.select().from(installation))[0]
      expect(row.setupSessionHash).toBe(tokenHash)
      expect(JSON.stringify(row)).not.toContain(token)

      const access = await getInstallationSessionAccess(db, tokenHash)
      expect(access).toMatchObject({ owned: true, locked: false })
      expect(JSON.stringify(access)).not.toContain(token)
      expect(JSON.stringify(access)).not.toContain(tokenHash)
    })
  })

  it('requires same-origin setup POSTs', () => {
    expect(isSameOriginSetupRequest('https://cms.example.com', 'https://cms.example.com', 'same-origin')).toBe(true)
    expect(isSameOriginSetupRequest('', 'https://cms.example.com')).toBe(false)
    expect(isSameOriginSetupRequest('https://evil.example', 'https://cms.example.com', 'cross-site')).toBe(false)
  })

  it('requires both D1 and R2 bindings on Cloudflare while allowing legacy R2', () => {
    const event = (env: Record<string, unknown>) => ({ context: { cloudflare: { env } } }) as any
    expect(getMissingCloudflareBindings(event({}))).toEqual(['DB', 'CONTENT_ASSETS'])
    expect(getMissingCloudflareBindings(event({ DB: {} }))).toEqual(['CONTENT_ASSETS'])
    expect(getMissingCloudflareBindings(event({ DB: {}, R2: {} }))).toEqual([])
    expect(getMissingCloudflareBindings(event({ DB: {}, CONTENT_ASSETS: {} }))).toEqual([])
    expect(getMissingCloudflareBindings({ context: {} } as any)).toEqual([])
  })
})
