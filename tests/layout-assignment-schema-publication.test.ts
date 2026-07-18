import { eq, sql } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'

import { createLayoutDocumentFromPreset, layoutNameKey } from '../shared/site-layout'
import { commitSchemaPublication } from '../server/cms/schema-publication'
import {
  layoutReference,
  layoutResource,
  publicRoute,
  schema,
  schemaActive,
  schemaRole
} from '../server/db/schema'
import { runMigrations, seedRoles } from '../server/utils/install'
import { createTestSqliteDb } from './fixtures/sqlite'

const localEvent = { context: {} } as any
const d1Event = { context: { cloudflare: { env: { DB: {} } } } } as any

async function seedLayout(db: any, layoutId: string) {
  const now = new Date('2026-07-18T02:00:00.000Z')
  const name = 'Schema publication Layout'
  await db.insert(layoutResource).values({
    id: layoutId,
    name,
    nameKey: layoutNameKey(name),
    documentJson: JSON.stringify(createLayoutDocumentFromPreset('blank', layoutId, name)),
    createdAt: now,
    updatedAt: now
  })
}

function publicationArgs(db: any, event: any, layoutId: string) {
  return {
    event,
    db,
    schemaKey: 'article',
    version: 1,
    previousVersion: null,
    title: 'Article',
    ast: { schemaKey: 'article', title: 'Article', fields: [], presentation: { layoutId } },
    jsonSchema: { type: 'object' },
    uiSchema: { 'x-ui': { schemaKey: 'article' } },
    registry: { schemaKey: 'article', version: 1, title: 'Article', fields: [], relations: [] },
    note: 'test publication',
    actorId: 'admin-1',
    layoutId,
    now: new Date('2026-07-18T02:01:00.000Z')
  }
}

describe('Schema Layout publication atomicity', () => {
  it('commits version, pointer, route, role, and exact-version reference together in SQLite', async () => {
    const fixture = await createTestSqliteDb()
    try {
      await runMigrations(fixture.db)
      await seedRoles(fixture.db)
      await seedLayout(fixture.db, 'layout-schema')

      await commitSchemaPublication(publicationArgs(fixture.db, localEvent, 'layout-schema'))

      expect(await fixture.db.select().from(schema).where(eq(schema.schemaKey, 'article'))).toHaveLength(1)
      expect(await fixture.db.select().from(schemaActive).where(eq(schemaActive.schemaKey, 'article')).get())
        .toMatchObject({ activeVersion: 1 })
      expect(await fixture.db.select().from(schemaRole).where(eq(schemaRole.schemaKey, 'article')).get())
        .toMatchObject({ roleKey: 'anonymous', canRead: true })
      expect(await fixture.db.select().from(publicRoute).where(eq(publicRoute.documentId, 'article')).get())
        .toMatchObject({ path: '/article', routeKind: 'canonical' })
      expect(await fixture.db.select().from(layoutReference).where(eq(layoutReference.ownerId, 'article')).get())
        .toMatchObject({ ownerType: 'schema', slot: 'published:1', layoutId: 'layout-schema' })
    } finally {
      fixture.close()
    }
  })

  it('uses one D1 batch and leaves no half-published state when Layout deletion wins', async () => {
    const fixture = await createTestSqliteDb()
    try {
      await runMigrations(fixture.db)
      await seedRoles(fixture.db)
      await seedLayout(fixture.db, 'layout-schema-racy')
      const batch = vi.fn(async (statements: any[]) => {
        await fixture.db.delete(layoutResource).where(eq(layoutResource.id, 'layout-schema-racy'))
        await fixture.db.run(sql.raw('BEGIN IMMEDIATE'))
        try {
          for (const statement of statements) await statement
          await fixture.db.run(sql.raw('COMMIT'))
        } catch (error) {
          await fixture.db.run(sql.raw('ROLLBACK'))
          throw error
        }
      })
      const d1Db = new Proxy(fixture.db as any, {
        get(target, property, receiver) {
          if (property === 'batch') return batch
          if (property === 'transaction') return vi.fn(() => {
            throw new Error('D1 Schema publication must use batch')
          })
          return Reflect.get(target, property, receiver)
        }
      })

      await expect(commitSchemaPublication(publicationArgs(d1Db, d1Event, 'layout-schema-racy')))
        .rejects.toThrow(/site_layout_reference/)
      expect(batch).toHaveBeenCalledOnce()
      expect(batch.mock.calls[0]?.[0]).toHaveLength(5)
      expect(await fixture.db.select().from(schema).where(eq(schema.schemaKey, 'article'))).toEqual([])
      expect(await fixture.db.select().from(schemaActive).where(eq(schemaActive.schemaKey, 'article'))).toEqual([])
      expect(await fixture.db.select().from(schemaRole).where(eq(schemaRole.schemaKey, 'article'))).toEqual([])
      expect(await fixture.db.select().from(publicRoute).where(eq(publicRoute.documentId, 'article'))).toEqual([])
      expect(await fixture.db.select().from(layoutReference).where(eq(layoutReference.ownerId, 'article'))).toEqual([])
    } finally {
      fixture.close()
    }
  })
})
