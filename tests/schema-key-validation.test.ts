import { describe, expect, it } from 'vitest'

import { schemaAstSchema } from '../server/cms/zod'
import { assertSchemaKeyCanBePersisted } from '../server/cms/schema-key'
import { schema } from '../server/db/schema'
import { runMigrations } from '../server/utils/install'
import { isReservedSchemaKey, PUBLIC_PAGE_ROUTE_PREFIX } from '../shared/public-routing'
import { createTestSqliteDb } from './fixtures/sqlite'

describe('schema key routing constraints', () => {
  it('reserves the singular public page prefix for new schemas while grandfathering existing ones', async () => {
    expect(PUBLIC_PAGE_ROUTE_PREFIX).toBe('p')
    expect(isReservedSchemaKey('p')).toBe(true)
    expect(schemaAstSchema.safeParse({
      schemaKey: 'p',
      title: 'Legacy schema',
      fields: []
    }).success).toBe(true)

    const fixture = await createTestSqliteDb()
    try {
      await runMigrations(fixture.db)
      await expect(assertSchemaKeyCanBePersisted(fixture.db as any, 'p'))
        .rejects.toMatchObject({ statusCode: 400 })
      await fixture.db.insert(schema).values({
        schemaKey: 'p',
        version: 1,
        title: 'Legacy schema',
        astJson: JSON.stringify({ schemaKey: 'p', title: 'Legacy schema', fields: [] }),
        jsonSchema: JSON.stringify({ type: 'object' }),
        createdAt: new Date('2026-07-13T00:00:00.000Z')
      })
      await expect(assertSchemaKeyCanBePersisted(fixture.db as any, 'p')).resolves.toBeUndefined()
    } finally {
      fixture.close()
    }
  })

  it('continues to accept ordinary schema keys', () => {
    expect(schemaAstSchema.safeParse({
      schemaKey: 'article',
      title: 'Article',
      fields: []
    }).success).toBe(true)
  })
})
