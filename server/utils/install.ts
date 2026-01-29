import { sql } from 'drizzle-orm'
import { compileSchemaAst } from '../cms/compiler'
import { defaultArticleSchemaAst } from '../cms/defaults'
import { upsertContentItemSnapshot } from '../cms/content-items'
import { syncContentFields } from '../cms/search-index'
import { content, schema, schemaActive, schemaRole, user, userRole } from '../db/schema'
import { newId } from './ids'
import { hashPassword } from './password'

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
  const glob = (import.meta as any).glob as undefined | ((pattern: string, opts: any) => Record<string, unknown>)

  if (!glob) {
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

  const journalModules = glob('../db/migrations/meta/_journal.json', { as: 'raw', eager: true })
  const journalRaw = Object.values(journalModules)[0] as string | undefined
  if (!journalRaw) throw new Error('Migration journal not found')

  const journal = JSON.parse(journalRaw) as {
    entries: Array<{ tag: string; when: number; breakpoints: boolean }>
  }

  const sqlModules = glob('../db/migrations/*.sql', { as: 'raw', eager: true })
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

async function getLastMigrationTimestamp(db: any) {
  const rows = await db.values(
    sql.raw('SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1')
  )
  const value = rows?.[0]?.[0]
  return value ? Number(value) : 0
}

export async function runMigrations(db: any) {
  await ensureMigrationsTable(db)
  let lastTimestamp = await getLastMigrationTimestamp(db)
  const migrations = await loadMigrations()

  for (const migration of migrations) {
    if (lastTimestamp && lastTimestamp >= migration.when) continue
    for (const statement of migration.statements) {
      await db.run(sql.raw(statement))
    }
    await db.run(
      sql`INSERT INTO __drizzle_migrations ("hash", "created_at") VALUES (${migration.hash}, ${migration.when})`
    )
    lastTimestamp = migration.when
  }
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

export async function ensureBootstrapSchema(db: any, createdBy: string) {
  const existing = await db.select({ schemaKey: schema.schemaKey }).from(schema).limit(1)
  if (existing.length) return null

  const now = new Date()
  const ast = defaultArticleSchemaAst()
  const version = 1
  const compiled = compileSchemaAst(ast, version)

  await db.insert(schema).values({
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
    note: 'bootstrap'
  })

  await db.insert(schemaActive).values({
    schemaKey: ast.schemaKey,
    activeVersion: 1,
    updatedAt: now
  })

  await ensureAnonymousSchemaRole(db, ast.schemaKey)
  await syncContentFields({ db, schemaKey: ast.schemaKey, registry: compiled.registry })

  const id = newId()
  const bootstrapExtra = {
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

  await db.insert(content).values({
    id,
    schemaKey: ast.schemaKey,
    schemaVersion: 1,
    title: 'Welcome guide',
    status: 'published',
    extraJson: JSON.stringify(bootstrapExtra),
    createdBy,
    createdAt: now,
    updatedAt: now
  })

  await upsertContentItemSnapshot({
    db,
    registry: compiled.registry,
    extra: bootstrapExtra,
    contentId: id,
    schemaKey: ast.schemaKey,
    schemaVersion: 1,
    title: 'Welcome guide',
    status: 'published',
    createdAt: now,
    updatedAt: now
  })

  return ast.schemaKey
}

export async function getInstallStatus(db: any) {
  const requiredTables = ['user', 'user_role', 'schema', 'schema_role']
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
    return { ready: false, missingTables }
  }

  const roleCountRows = await db.values(sql.raw('SELECT COUNT(1) FROM user_role'))
  const userCountRows = await db.values(sql.raw('SELECT COUNT(1) FROM user'))
  const schemaCountRows = await db.values(sql.raw('SELECT COUNT(1) FROM schema'))
  const roleCount = Number(roleCountRows?.[0]?.[0] ?? 0)
  const userCount = Number(userCountRows?.[0]?.[0] ?? 0)
  const schemaCount = Number(schemaCountRows?.[0]?.[0] ?? 0)

  return {
    ready: roleCount > 0 && userCount > 0,
    missingTables: [],
    roleCount,
    userCount,
    schemaCount
  }
}
