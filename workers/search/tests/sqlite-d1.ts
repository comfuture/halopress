import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import type {
  D1Database,
  D1PreparedStatement,
  D1Result
} from '../src/types'

class SqliteD1Statement implements D1PreparedStatement {
  private values: unknown[] = []

  constructor(
    private readonly sqlite: DatabaseSync,
    private readonly query: string
  ) {}

  bind(...values: unknown[]) {
    const statement = new SqliteD1Statement(this.sqlite, this.query)
    statement.values = values
    return statement
  }

  async first<T>() {
    return (this.sqlite.prepare(this.query).get(...this.values as any[]) as T | undefined) ?? null
  }

  async all<T>() {
    return {
      success: true,
      results: this.sqlite.prepare(this.query).all(...this.values as any[]) as T[]
    }
  }

  async run<T>() {
    const result = this.sqlite.prepare(this.query).run(...this.values as any[])
    return {
      success: true,
      results: [] as T[],
      meta: {
        changes: Number(result.changes),
        last_row_id: Number(result.lastInsertRowid)
      }
    }
  }
}

export class SqliteD1 implements D1Database {
  constructor(readonly sqlite = new DatabaseSync(':memory:')) {}

  prepare(query: string) {
    return new SqliteD1Statement(this.sqlite, query)
  }

  async batch<T>(statements: D1PreparedStatement[]) {
    this.sqlite.exec('BEGIN IMMEDIATE')
    try {
      const results: Array<D1Result<T>> = []
      for (const statement of statements) results.push(await statement.run<T>())
      this.sqlite.exec('COMMIT')
      return results
    } catch (error) {
      this.sqlite.exec('ROLLBACK')
      throw error
    }
  }

  close() {
    this.sqlite.close()
  }
}

export async function applyMigrations(db: SqliteD1) {
  const directory = resolve(import.meta.dirname, '../../../server/db/migrations')
  const migrations = (await readdir(directory))
    .filter(filename => /^\d{4}_.+\.sql$/.test(filename))
    .sort()
  for (const filename of migrations) {
    const sql = await readFile(resolve(directory, filename), 'utf8')
    for (const statement of sql
      .split('--> statement-breakpoint')
      .map(value => value.trim())
      .filter(Boolean)) {
      db.sqlite.exec(statement)
    }
  }
}
