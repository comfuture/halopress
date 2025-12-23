import { join } from 'node:path'
import { drizzle as drizzleProxy } from 'drizzle-orm/sqlite-proxy'
import type { H3Event } from 'h3'

import * as tables from './schema'

type D1Database = {
  exec: (sql: string) => Promise<unknown>
}

type SqlMethod = 'run' | 'all' | 'values' | 'get'

type NodeSqlite = {
  exec: (sql: string) => void
  prepare: (sql: string) => {
    run: (...params: any[]) => { changes?: number; lastInsertRowid?: number }
    all: (...params: any[]) => any[]
    get: (...params: any[]) => any
    columns: () => { name: string }[]
  }
}

let localDb: NodeSqlite | null = null

async function getLocalDb(): Promise<NodeSqlite> {
  if (localDb) return localDb
  const { DatabaseSync } = await import('node:sqlite')
  await import('node:fs/promises').then(fs => fs.mkdir(join(process.cwd(), '.data'), { recursive: true }))

  const dbPath = join(process.cwd(), '.data', 'halopress.sqlite')
  localDb = new DatabaseSync(dbPath) as unknown as NodeSqlite
  localDb.exec('PRAGMA foreign_keys = ON;')
  return localDb
}

export type Db = any

export async function getDb(event?: H3Event): Promise<Db> {
  // Cloudflare D1 path (runtime binding)
  const cf = (event as any)?.context?.cloudflare
  const d1: D1Database | undefined = cf?.env?.DB
  if (d1) {
    const { drizzle } = await import('drizzle-orm/d1')
    return drizzle(d1, { schema: tables }) as unknown as Db
  }

  // Local dev path: Node 22 built-in SQLite (node:sqlite) via drizzle sqlite-proxy.
  const sqlite = await getLocalDb()

  const callback = async (sql: string, params: any[], method: SqlMethod) => {
    const stmt = sqlite.prepare(sql)
    const safeParams = params ?? []

    if (method === 'run') {
      stmt.run(...safeParams)
      return { rows: [] }
    }
    if (method === 'get') {
      const row = stmt.get(...safeParams)
      return { rows: row ? Object.values(row) : undefined }
    }
    if (method === 'values') {
      const rows = stmt.all(...safeParams).map(row => Object.values(row))
      return { rows }
    }
    // all
    return { rows: stmt.all(...safeParams).map(row => Object.values(row)) }
  }

  return drizzleProxy(callback as any, { schema: tables })
}
