import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

type NodeSqlite = {
  exec: (sql: string) => void
  prepare: (sql: string) => {
    run: (...params: unknown[]) => void
    get: (...params: unknown[]) => Record<string, unknown> | undefined
  }
  close: () => void
}

async function migrationSql(index: number) {
  const directory = resolve(import.meta.dirname, '../server/db/migrations')
  const filename = (await readdir(directory)).find(name => name.startsWith(`${String(index).padStart(4, '0')}_`) && name.endsWith('.sql'))
  if (!filename) throw new Error(`Migration ${index} not found`)
  return await readFile(resolve(directory, filename), 'utf8')
}

async function databaseBeforeLayouts() {
  const { DatabaseSync } = await import('node:sqlite')
  const sqlite = new DatabaseSync(':memory:') as unknown as NodeSqlite
  for (let index = 0; index <= 8; index++) sqlite.exec(await migrationSql(index))
  return sqlite
}

describe('Layout migration', () => {
  it('creates empty resource and assignment-reference storage from the generated schema migration', async () => {
    const sqlite = await databaseBeforeLayouts()
    try {
      const sql = await migrationSql(9)
      sqlite.exec(sql)
      expect(sql).not.toMatch(/INSERT\s+INTO\s+[`"]?site_layout_/i)
      expect(sqlite.prepare('SELECT * FROM site_layout_resource').get()).toBeUndefined()
      expect(sqlite.prepare('SELECT * FROM site_layout_reference').get()).toBeUndefined()
    } finally {
      sqlite.close()
    }
  })

  it('uniquely indexes the application-derived Layout name key', async () => {
    const sqlite = await databaseBeforeLayouts()
    try {
      sqlite.exec(await migrationSql(9))
      const document = JSON.stringify({ version: 1, layoutId: 'layout-one', name: 'Straße', grid: {}, elements: [] })
      sqlite.prepare(`
        INSERT INTO site_layout_resource
          (id, name, name_key, document_json, current_revision, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, 1, 1)
      `).run('layout-one', 'Straße', 'strasse', document)

      expect(() => sqlite.prepare(`
        INSERT INTO site_layout_resource
          (id, name, name_key, document_json, current_revision, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, 1, 1)
      `).run('layout-two', 'STRASSE', 'strasse', document))
        .toThrow(/UNIQUE constraint failed: site_layout_resource\.name_key/)
    } finally {
      sqlite.close()
    }
  })

  it('enforces normalized Layout references with an ON DELETE RESTRICT foreign key', async () => {
    const sqlite = await databaseBeforeLayouts()
    try {
      sqlite.exec(await migrationSql(9))
      sqlite.exec('PRAGMA foreign_keys = ON')
      sqlite.prepare(`
        INSERT INTO site_layout_resource
          (id, name, name_key, document_json, current_revision, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, 1, 1)
      `).run('layout-one', 'Referenced', 'referenced', '{}')
      sqlite.prepare(`
        INSERT INTO site_layout_reference
          (owner_type, owner_id, slot, layout_id, label, behavior, created_at, updated_at)
        VALUES ('page', 'home-page', 'working', ?, 'Home Page working Layout', 'use-current', 1, 1)
      `).run('layout-one')

      expect(() => sqlite.prepare('DELETE FROM site_layout_resource WHERE id = ?').run('layout-one'))
        .toThrow(/FOREIGN KEY constraint failed/)
      expect(sqlite.prepare('SELECT id FROM site_layout_resource WHERE id = ?').get('layout-one'))
        .toEqual({ id: 'layout-one' })
    } finally {
      sqlite.close()
    }
  })
})
