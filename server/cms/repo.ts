import { and, desc, eq } from 'drizzle-orm'
import type { Db } from '../db/db'
import { schema as schemaTable, schemaActive as schemaActiveTable, schemaDraft as schemaDraftTable } from '../db/schema'
import type { SchemaAst, SchemaRegistry } from './types'

export async function listActiveSchemas(db: Db) {
  const rows = await db
    .select({
      schemaKey: schemaActiveTable.schemaKey,
      activeVersion: schemaActiveTable.activeVersion,
      updatedAt: schemaActiveTable.updatedAt,
      title: schemaTable.title
    })
    .from(schemaActiveTable)
    .leftJoin(schemaTable, and(eq(schemaTable.schemaKey, schemaActiveTable.schemaKey), eq(schemaTable.version, schemaActiveTable.activeVersion)))
    .orderBy(schemaActiveTable.schemaKey)

  return rows.map((r: any) => ({
    schemaKey: r.schemaKey,
    activeVersion: r.activeVersion,
    updatedAt: r.updatedAt,
    title: r.title ?? r.schemaKey
  }))
}

export async function getActiveSchema(db: Db, schemaKey: string) {
  const active = await db
    .select()
    .from(schemaActiveTable)
    .where(eq(schemaActiveTable.schemaKey, schemaKey))
    .get()

  if (!active) return null

  const row = await db
    .select()
    .from(schemaTable)
    .where(and(eq(schemaTable.schemaKey, schemaKey), eq(schemaTable.version, active.activeVersion)))
    .get()

  if (!row) return null

  return {
    schemaKey,
    version: row.version,
    title: row.title ?? schemaKey,
    ast: JSON.parse(row.astJson) as SchemaAst,
    jsonSchema: JSON.parse(row.jsonSchema),
    uiSchema: row.uiSchema ? JSON.parse(row.uiSchema) : null,
    registry: row.registryJson ? (JSON.parse(row.registryJson) as SchemaRegistry) : null,
    createdAt: row.createdAt,
    updatedAt: active.updatedAt
  }
}

export async function listSchemaVersions(db: Db, schemaKey: string) {
  const rows = await db
    .select({
      schemaKey: schemaTable.schemaKey,
      version: schemaTable.version,
      title: schemaTable.title,
      createdAt: schemaTable.createdAt,
      note: schemaTable.note
    })
    .from(schemaTable)
    .where(eq(schemaTable.schemaKey, schemaKey))
    .orderBy(desc(schemaTable.version))

  return rows
}

export async function getSchemaVersion(db: Db, schemaKey: string, version: number) {
  const row = await db
    .select()
    .from(schemaTable)
    .where(and(eq(schemaTable.schemaKey, schemaKey), eq(schemaTable.version, version)))
    .get()

  if (!row) return null

  return {
    schemaKey,
    version: row.version,
    title: row.title ?? schemaKey,
    ast: JSON.parse(row.astJson) as SchemaAst,
    jsonSchema: JSON.parse(row.jsonSchema),
    uiSchema: row.uiSchema ? JSON.parse(row.uiSchema) : null,
    registry: row.registryJson ? (JSON.parse(row.registryJson) as SchemaRegistry) : null,
    diff: row.diffJson ? JSON.parse(row.diffJson) : null,
    createdAt: row.createdAt,
    note: row.note ?? null
  }
}

export async function getDraft(db: Db, schemaKey: string) {
  const row = await db
    .select()
    .from(schemaDraftTable)
    .where(eq(schemaDraftTable.schemaKey, schemaKey))
    .get()

  if (!row) return null
  return {
    schemaKey,
    title: row.title ?? schemaKey,
    ast: JSON.parse(row.astJson) as SchemaAst,
    updatedAt: row.updatedAt
  }
}

export async function upsertDraft(db: Db, schemaKey: string, title: string, ast: SchemaAst) {
  const now = new Date()
  await db
    .insert(schemaDraftTable)
    .values({
      schemaKey,
      title,
      astJson: JSON.stringify(ast),
      updatedAt: now
    })
    .onConflictDoUpdate({
      target: schemaDraftTable.schemaKey,
      set: {
        title,
        astJson: JSON.stringify(ast),
        updatedAt: now
      }
    })
}
