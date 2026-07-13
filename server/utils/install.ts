import { and, eq, gt, isNull, lte, ne, or, sql } from 'drizzle-orm'
import { compileSchemaAst } from '../cms/compiler'
import { parseContentJson } from '../cms/content-json'
import { defaultArticleSchemaAst } from '../cms/defaults'
import { upsertContentListingSnapshot } from '../cms/content-listing'
import { syncSearchConfig } from '../cms/search-config'
import { upsertContentSearchData } from '../cms/search-index'
import {
  content,
  installation,
  schema,
  schemaActive,
  schemaRole,
  user,
  userRole
} from '../db/schema'
import { newId } from './ids'
import { SETUP_SESSION_TTL_MILLISECONDS } from './install-session'
import { hashPassword } from './password'
import {
  BOOTSTRAP_CONTENT_ID,
  BOOTSTRAP_SCHEMA_KEY,
  BOOTSTRAP_SCHEMA_NOTE,
  BOOTSTRAP_SCHEMA_VERSION
} from './bootstrap'

export const INSTALLATION_KEY = 'singleton'
const INSTALL_LEASE_MILLISECONDS = 5 * 60 * 1000

export const REQUIRED_INSTALL_TABLES = [
  'asset',
  'content',
  'content_listing',
  'content_ref',
  'content_ref_list',
  'content_search_data',
  'document_asset_ref',
  'installation',
  'page',
  'publication_revision',
  'schema',
  'schema_active',
  'schema_draft',
  'schema_role',
  'search_config',
  'settings',
  'user',
  'user_role'
] as const

function splitStatements(raw: string) {
  return raw
    .split('--> statement-breakpoint')
    .map(part => part.trim())
    .filter(Boolean)
}

async function sha256Hex(text: string) {
  if (globalThis.crypto?.subtle) {
    const data = new TextEncoder().encode(text)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  }
  const { createHash } = await import('node:crypto')
  return createHash('sha256').update(text).digest('hex')
}

async function loadMigrations(): Promise<Array<{ when: number; hash: string; statements: string[] }>> {
  if (!(import.meta as any).glob) {
    const { readMigrationFiles } = await import('drizzle-orm/migrator')
    const { resolve } = await import('node:path')
    const migrations = readMigrationFiles({
      migrationsFolder: resolve(process.cwd(), 'server/db/migrations')
    })
    return migrations.map((migration) => ({
      when: migration.folderMillis,
      hash: migration.hash,
      statements: migration.sql.map(statement => statement.trim()).filter(Boolean)
    }))
  }

  const journalModules = (import.meta as any).glob('../db/migrations/meta/_journal.json', {
    query: '?raw',
    import: 'default',
    eager: true
  })
  const journalRaw = Object.values(journalModules)[0] as string | undefined
  if (!journalRaw) throw new Error('Migration journal not found')

  const journal = JSON.parse(journalRaw) as {
    entries: Array<{ tag: string; when: number; breakpoints: boolean }>
  }

  const sqlModules = (import.meta as any).glob('../db/migrations/*.sql', {
    query: '?raw',
    import: 'default',
    eager: true
  })
  const entries: Array<{ when: number; hash: string; statements: string[] }> = []

  for (const entry of journal.entries) {
    const fileKey = Object.keys(sqlModules).find(key => key.endsWith(`/${entry.tag}.sql`))
    if (!fileKey) throw new Error(`Missing migration file for ${entry.tag}`)
    const sqlText = sqlModules[fileKey] as string
    const hash = await sha256Hex(sqlText)
    entries.push({
      when: entry.when,
      hash,
      statements: splitStatements(sqlText)
    })
  }

  return entries
}

async function ensureMigrationsTable(db: any) {
  await db.run(
    sql.raw(`CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at numeric
    )`)
  )
}

async function getAppliedMigrationTimestamps(db: any) {
  const rows = await db.values(
    sql.raw('SELECT created_at FROM __drizzle_migrations')
  )
  return new Set((rows ?? []).map((row: unknown[]) => Number(row[0])).filter(Number.isFinite))
}

async function runMigrationsInternal(db: any) {
  await ensureMigrationsTable(db)
  const appliedTimestamps = await getAppliedMigrationTimestamps(db)
  const migrations = await loadMigrations()

  for (const migration of migrations) {
    if (appliedTimestamps.has(migration.when)) continue
    await db.transaction(async (tx: any) => {
      for (const statement of migration.statements) {
        await tx.run(sql.raw(statement))
      }
      await tx.run(
        sql`INSERT INTO __drizzle_migrations ("hash", "created_at") VALUES (${migration.hash}, ${migration.when})`
      )
    })
    appliedTimestamps.add(migration.when)
  }
}

let migrationQueue: Promise<void> = Promise.resolve()

export async function runMigrations(db: any) {
  const migrationRun = migrationQueue.then(() => runMigrationsInternal(db))
  migrationQueue = migrationRun.catch(() => {})
  await migrationRun
}

export type UserRoleSeed = { roleKey: string; title: string; level: number }

const defaultRoles: UserRoleSeed[] = [
  { roleKey: 'admin', title: 'Admin', level: 100 },
  { roleKey: 'user', title: 'User', level: 50 },
  { roleKey: 'anonymous', title: 'Anonymous', level: 0 }
]

export async function seedRoles(db: any, roles: UserRoleSeed[] = defaultRoles) {
  await db
    .insert(userRole)
    .values(roles)
    .onConflictDoNothing()
}

export async function ensureAnonymousSchemaRole(db: any, schemaKey: string) {
  await db
    .insert(schemaRole)
    .values({
      schemaKey,
      roleKey: 'anonymous',
      canRead: true,
      canWrite: false,
      canAdmin: false
    })
    .onConflictDoNothing()
}

export async function ensureAdminUser(db: any, payload: { email: string; name?: string; password: string }) {
  const email = payload.email.trim().toLowerCase()
  const existing = await db.select({ id: user.id }).from(user).limit(1)
  if (existing.length) return null

  const { hash, salt } = await hashPassword(payload.password)
  const id = newId()
  await db.insert(user).values({
    id,
    email,
    name: payload.name?.trim() || null,
    roleKey: 'admin',
    passwordHash: hash,
    passwordSalt: salt,
    status: 'active',
    createdAt: new Date()
  })
  return id
}

export type InstallationClaim = {
  leaseToken: string
  leaseExpiresAt: Date
}

export type InstallationSessionAccess = {
  owned: boolean
  locked: boolean
  state: string | null
  retryAfterSeconds?: number
}

function retryAfterSeconds(now: Date, dates: Array<Date | null | undefined>) {
  const retryAt = Math.max(now.getTime(), ...dates.filter(Boolean).map(date => date!.getTime()))
  const seconds = Math.ceil((retryAt - now.getTime()) / 1000)
  return seconds > 0 ? seconds : undefined
}

export async function getInstallationSessionAccess(
  db: any,
  setupSessionHash: string | null,
  now = new Date()
): Promise<InstallationSessionAccess> {
  const row = await db
    .select({
      state: installation.state,
      setupSessionHash: installation.setupSessionHash,
      setupSessionExpiresAt: installation.setupSessionExpiresAt,
      leaseToken: installation.leaseToken,
      leaseExpiresAt: installation.leaseExpiresAt
    })
    .from(installation)
    .where(eq(installation.key, INSTALLATION_KEY))
    .get()

  if (!row || row.state === 'complete') {
    return { owned: false, locked: false, state: row?.state ?? null }
  }

  const setupSessionActive = Boolean(
    row.setupSessionHash
    && row.setupSessionExpiresAt
    && row.setupSessionExpiresAt.getTime() > now.getTime()
  )
  const installLeaseActive = Boolean(
    row.state === 'installing'
    && row.leaseToken
    && row.leaseExpiresAt
    && row.leaseExpiresAt.getTime() > now.getTime()
  )
  const owned = Boolean(
    setupSessionHash
    && setupSessionActive
    && row.setupSessionHash === setupSessionHash
  )
  const locked = !owned && (setupSessionActive || installLeaseActive)

  return {
    owned,
    locked,
    state: row.state,
    retryAfterSeconds: locked
      ? retryAfterSeconds(now, [row.setupSessionExpiresAt, row.leaseExpiresAt])
      : undefined
  }
}

export async function refreshInstallationSession(
  db: any,
  setupSessionHash: string,
  now = new Date()
) {
  const setupSessionExpiresAt = new Date(now.getTime() + SETUP_SESSION_TTL_MILLISECONDS)
  const refreshed = await db
    .update(installation)
    .set({ setupSessionExpiresAt, updatedAt: now })
    .where(and(
      eq(installation.key, INSTALLATION_KEY),
      ne(installation.state, 'complete'),
      eq(installation.setupSessionHash, setupSessionHash),
      gt(installation.setupSessionExpiresAt, now)
    ))
    .returning({ key: installation.key })
  return Boolean(refreshed?.length)
}

export async function reserveInstallationSession(
  db: any,
  setupSessionHash: string,
  now = new Date()
) {
  const setupSessionExpiresAt = new Date(now.getTime() + SETUP_SESSION_TTL_MILLISECONDS)
  const reserved = await db
    .insert(installation)
    .values({
      key: INSTALLATION_KEY,
      state: 'reserved',
      owner: `browser:${setupSessionHash.slice(0, 16)}`,
      setupSessionHash,
      setupSessionExpiresAt,
      leaseToken: null,
      leaseExpiresAt: null,
      completedAt: null,
      updatedAt: now,
      lastError: null
    })
    .onConflictDoUpdate({
      target: installation.key,
      set: {
        state: 'reserved',
        owner: `browser:${setupSessionHash.slice(0, 16)}`,
        setupSessionHash,
        setupSessionExpiresAt,
        leaseToken: null,
        leaseExpiresAt: null,
        updatedAt: now,
        lastError: null
      },
      setWhere: and(
        ne(installation.state, 'complete'),
        or(
          isNull(installation.setupSessionHash),
          isNull(installation.setupSessionExpiresAt),
          lte(installation.setupSessionExpiresAt, now)
        ),
        or(
          ne(installation.state, 'installing'),
          isNull(installation.leaseToken),
          isNull(installation.leaseExpiresAt),
          lte(installation.leaseExpiresAt, now)
        )
      )
    })
    .returning({ key: installation.key })
  return Boolean(reserved?.length)
}

export async function beginInstallation(
  db: any,
  setupSessionHash: string,
  options: { now?: Date; leaseMilliseconds?: number; leaseToken?: string } = {}
): Promise<InstallationClaim | null> {
  const now = options.now ?? new Date()
  const leaseToken = options.leaseToken ?? newId()
  const leaseExpiresAt = new Date(now.getTime() + (options.leaseMilliseconds ?? INSTALL_LEASE_MILLISECONDS))
  const claimed = await db
    .update(installation)
    .set({
      state: 'installing',
      leaseToken,
      leaseExpiresAt,
      updatedAt: now,
      lastError: null
    })
    .where(and(
      eq(installation.key, INSTALLATION_KEY),
      ne(installation.state, 'complete'),
      eq(installation.setupSessionHash, setupSessionHash),
      gt(installation.setupSessionExpiresAt, now),
      or(
        ne(installation.state, 'installing'),
        isNull(installation.leaseToken),
        isNull(installation.leaseExpiresAt),
        lte(installation.leaseExpiresAt, now)
      )
    ))
    .returning({ leaseToken: installation.leaseToken, leaseExpiresAt: installation.leaseExpiresAt })

  const row = claimed?.[0]
  if (!row?.leaseToken || !row.leaseExpiresAt) return null
  return { leaseToken: row.leaseToken, leaseExpiresAt: row.leaseExpiresAt }
}

export async function failInstallation(db: any, leaseToken: string, error: unknown, now = new Date()) {
  const message = (error instanceof Error ? error.message : String(error || 'Installation failed')).slice(0, 1000)
  await db
    .update(installation)
    .set({
      state: 'reserved',
      leaseToken: null,
      leaseExpiresAt: null,
      updatedAt: now,
      lastError: message
    })
    .where(and(
      eq(installation.key, INSTALLATION_KEY),
      eq(installation.leaseToken, leaseToken),
      ne(installation.state, 'complete')
    ))
}

export async function completeInstallation(db: any, leaseToken: string, owner: string, now = new Date()) {
  const completed = await db
    .update(installation)
    .set({
      state: 'complete',
      owner,
      setupSessionHash: null,
      setupSessionExpiresAt: null,
      leaseToken: null,
      leaseExpiresAt: null,
      completedAt: now,
      updatedAt: now,
      lastError: null
    })
    .where(and(
      eq(installation.key, INSTALLATION_KEY),
      eq(installation.leaseToken, leaseToken),
      eq(installation.state, 'installing')
    ))
    .returning({ key: installation.key })

  if (!completed?.length) {
    throw new Error('Installation lease is no longer owned by this request')
  }
}

export async function ensureBootstrapSchema(db: any, createdBy: string) {
  const now = new Date()
  const ast = defaultArticleSchemaAst()
  if (ast.schemaKey !== BOOTSTRAP_SCHEMA_KEY) throw new Error('Default Article schema key does not match the bootstrap schema key')
  const version = BOOTSTRAP_SCHEMA_VERSION
  const compiled = compileSchemaAst(ast, version)

  await db
    .insert(schema)
    .values({
      schemaKey: ast.schemaKey,
      version,
      title: ast.title,
      astJson: JSON.stringify(ast),
      jsonSchema: JSON.stringify(compiled.jsonSchema),
      uiSchema: JSON.stringify(compiled.uiSchema),
      registryJson: JSON.stringify(compiled.registry),
      diffJson: JSON.stringify({ from: null, to: 1 }),
      createdBy,
      createdAt: now,
      note: BOOTSTRAP_SCHEMA_NOTE
    })
    .onConflictDoNothing()

  const storedSchema = await db
    .select({
      registryJson: schema.registryJson,
      note: schema.note
    })
    .from(schema)
    .where(and(eq(schema.schemaKey, ast.schemaKey), eq(schema.version, version)))
    .get()

  if (!storedSchema || storedSchema.note !== BOOTSTRAP_SCHEMA_NOTE) return null

  await db
    .insert(schemaActive)
    .values({
      schemaKey: ast.schemaKey,
      activeVersion: 1,
      updatedAt: now
    })
    .onConflictDoNothing()

  const active = await db
    .select({ activeVersion: schemaActive.activeVersion })
    .from(schemaActive)
    .where(eq(schemaActive.schemaKey, ast.schemaKey))
    .get()
  if (!active || active.activeVersion !== version) return null

  const registry = storedSchema.registryJson
    ? JSON.parse(storedSchema.registryJson)
    : compiled.registry

  await ensureAnonymousSchemaRole(db, ast.schemaKey)
  await syncSearchConfig({ db, schemaKey: ast.schemaKey, registry })

  const bootstrapContent = {
    title: 'Welcome guide',
    body: {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Welcome to Halopress' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'This guide helps you explore the Article schema created during setup.' }
          ]
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Next, create your own schemas and start publishing content from the desk.'
            }
          ]
        }
      ]
    }
  }

  await db
    .insert(content)
    .values({
      id: BOOTSTRAP_CONTENT_ID,
      schemaKey: ast.schemaKey,
      schemaVersion: 1,
      status: 'published',
      contentJson: JSON.stringify(bootstrapContent),
      createdBy,
      createdAt: now,
      updatedAt: now
    })
    .onConflictDoNothing()

  const storedContent = await db
    .select()
    .from(content)
    .where(eq(content.id, BOOTSTRAP_CONTENT_ID))
    .get()
  if (!storedContent || storedContent.schemaKey !== ast.schemaKey) return null
  const storedContentJson = parseContentJson(storedContent.contentJson)

  await upsertContentListingSnapshot({
    db,
    registry,
    content: storedContentJson,
    contentId: storedContent.id,
    schemaKey: storedContent.schemaKey,
    schemaVersion: storedContent.schemaVersion,
    status: storedContent.status,
    createdAt: storedContent.createdAt,
    updatedAt: storedContent.updatedAt
  })
  await upsertContentSearchData({
    db,
    contentId: storedContent.id,
    registry,
    content: storedContentJson
  })

  return ast.schemaKey
}

export type InstallPhase =
  | 'migration_required'
  | 'ready_for_setup'
  | 'installing'
  | 'resume_required'
  | 'complete'

export async function getInstallStatus(db: any, now = new Date()) {
  const requiredTables = [...REQUIRED_INSTALL_TABLES]
  const rows = await db.values(
    sql.raw(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${requiredTables
        .map(name => `'${name}'`)
        .join(', ')})`
    )
  )
  const existingTables = new Set((rows ?? []).map((row: any[]) => row?.[0]).filter(Boolean))
  const missingTables = requiredTables.filter(name => !existingTables.has(name))

  if (missingTables.length) {
    return {
      ready: false,
      canInstall: false,
      phase: 'migration_required' as const,
      missingTables
    }
  }

  const roleCountRows = await db.values(sql.raw('SELECT COUNT(1) FROM user_role'))
  const userCountRows = await db.values(sql.raw('SELECT COUNT(1) FROM user'))
  const schemaCountRows = await db.values(sql.raw('SELECT COUNT(1) FROM schema'))
  const roleCount = Number(roleCountRows?.[0]?.[0] ?? 0)
  const userCount = Number(userCountRows?.[0]?.[0] ?? 0)
  const schemaCount = Number(schemaCountRows?.[0]?.[0] ?? 0)

  const installRow = await db
    .select({
      state: installation.state,
      leaseToken: installation.leaseToken,
      leaseExpiresAt: installation.leaseExpiresAt,
      lastError: installation.lastError
    })
    .from(installation)
    .where(eq(installation.key, INSTALLATION_KEY))
    .get()

  const complete = installRow?.state === 'complete'
  const leaseActive = installRow?.state === 'installing'
    && Boolean(installRow.leaseToken)
    && Boolean(installRow.leaseExpiresAt && installRow.leaseExpiresAt.getTime() > now.getTime())
  const phase: InstallPhase = complete
    ? 'complete'
    : leaseActive
      ? 'installing'
      : userCount > 0
        ? 'resume_required'
        : 'ready_for_setup'

  return {
    ready: complete,
    canInstall: phase === 'ready_for_setup' || phase === 'resume_required',
    phase,
    missingTables: [],
    roleCount,
    userCount,
    schemaCount,
    hasLastError: Boolean(installRow?.lastError)
  }
}

export async function getRuntimeInstallStatus(
  db: any,
  options: { isCloudflareRuntime: boolean; now?: Date }
) {
  if (!options.isCloudflareRuntime) {
    await runMigrations(db)
  }
  return await getInstallStatus(db, options.now)
}
