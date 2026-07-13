import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  content,
  contentListing,
  publicationRevision,
  schema,
  schemaActive
} from '../server/db/schema'
import { runMigrations } from '../server/utils/install'
import { createTestSqliteDb } from './fixtures/sqlite'

type EndpointHandler = (event: any) => Promise<any>

const dbState = vi.hoisted(() => ({ current: null as any }))
const bodyState = vi.hoisted(() => ({ current: {} as { status?: string, content?: Record<string, unknown> } }))

vi.mock('../server/db/db', () => ({ getDb: vi.fn(async () => dbState.current) }))
vi.mock('../server/utils/auth', () => ({
  getAuthSession: vi.fn(async () => ({ user: { id: 'admin-1', role: 'admin' } }))
}))
vi.mock('../server/utils/schema-permission', () => ({
  requireSchemaPermission: vi.fn(async () => ({ roleKey: 'admin', canRead: true, canWrite: true, canAdmin: true }))
}))
vi.mock('../server/utils/widget-cache', () => ({ queueWidgetCacheInvalidation: vi.fn() }))
vi.mock('h3', async (importOriginal) => ({
  ...await importOriginal<typeof import('h3')>(),
  readBody: vi.fn(async () => bodyState.current)
}))
vi.stubGlobal('defineEventHandler', (handler: EndpointHandler) => handler)

let fixture: Awaited<ReturnType<typeof createTestSqliteDb>>
let createHandler: EndpointHandler
let updateHandler: EndpointHandler

function event(id?: string) {
  return { context: { params: { schemaKey: 'article', ...(id ? { id } : {}) } } }
}

beforeAll(async () => {
  fixture = await createTestSqliteDb()
  dbState.current = fixture.db
  await runMigrations(fixture.db)
  const now = new Date('2026-07-13T00:00:00.000Z')
  await fixture.db.insert(schema).values({
    schemaKey: 'article',
    version: 1,
    title: 'Article',
    astJson: JSON.stringify({ schemaKey: 'article', title: 'Article', fields: [] }),
    jsonSchema: JSON.stringify({
      type: 'object',
      properties: { title: { type: 'string' } },
      required: ['title'],
      additionalProperties: false
    }),
    registryJson: JSON.stringify({
      schemaKey: 'article',
      version: 1,
      title: 'Article',
      listing: { titleFieldKey: 'title' },
      fields: [{ fieldId: 'article-title', key: 'title', kind: 'string' }],
      relations: []
    }),
    createdAt: now
  })
  await fixture.db.insert(schemaActive).values({ schemaKey: 'article', activeVersion: 1, updatedAt: now })

  createHandler = (await import('../server/api/content/[schemaKey]/index.post')).default as EndpointHandler
  updateHandler = (await import('../server/api/content/[schemaKey]/[id].put')).default as EndpointHandler
})

beforeEach(() => {
  bodyState.current = {}
})

afterAll(() => {
  fixture.close()
  vi.unstubAllGlobals()
})

describe('content working statuses', () => {
  it('preserves archived status across create and status-omitted updates', async () => {
    bodyState.current = { status: 'archived', content: { title: 'Archived original' } }
    const created = await createHandler(event())

    await expect(fixture.db.select().from(content).where(eq(content.id, created.id)).get())
      .resolves.toMatchObject({ status: 'archived', publishedRevisionId: null })
    await expect(fixture.db.select().from(contentListing).where(and(
      eq(contentListing.contentId, created.id),
      eq(contentListing.projectionScope, 'working')
    )).get()).resolves.toMatchObject({ status: 'archived', title: 'Archived original' })

    bodyState.current = { content: { title: 'Archived updated' } }
    await expect(updateHandler(event(created.id))).resolves.toMatchObject({
      ok: true,
      publicationState: 'never-published'
    })
    await expect(fixture.db.select().from(content).where(eq(content.id, created.id)).get())
      .resolves.toMatchObject({ status: 'archived' })
    await expect(fixture.db.select().from(contentListing).where(and(
      eq(contentListing.contentId, created.id),
      eq(contentListing.projectionScope, 'working')
    )).get()).resolves.toMatchObject({ status: 'archived', title: 'Archived updated' })

    bodyState.current = { status: 'deleted', content: { title: 'Bypass delete' } }
    await expect(updateHandler(event(created.id))).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Use the delete endpoint to delete content'
    })
  })

  it('keeps the published revision immutable when working content becomes archived', async () => {
    bodyState.current = { status: 'published', content: { title: 'Published title' } }
    const created = await createHandler(event())
    const publishedRow = await fixture.db.select().from(content).where(eq(content.id, created.id)).get()
    const publishedRevisionId = publishedRow!.publishedRevisionId

    bodyState.current = { status: 'archived', content: { title: 'Archived draft' } }
    await expect(updateHandler(event(created.id))).resolves.toMatchObject({
      ok: true,
      publicationState: 'published-with-draft',
      hasDraftChanges: true
    })

    await expect(fixture.db.select().from(content).where(eq(content.id, created.id)).get())
      .resolves.toMatchObject({ status: 'archived', publishedRevisionId })
    const listings = await fixture.db.select().from(contentListing)
      .where(eq(contentListing.contentId, created.id))
    expect(listings).toEqual(expect.arrayContaining([
      expect.objectContaining({ projectionScope: 'working', status: 'archived', title: 'Archived draft' }),
      expect.objectContaining({ projectionScope: 'published', status: 'published', title: 'Published title' })
    ]))
    const revision = await fixture.db.select().from(publicationRevision)
      .where(eq(publicationRevision.id, publishedRevisionId!))
      .get()
    expect(JSON.parse(revision!.contentJson)).toEqual({ title: 'Published title' })
  })

  it('rejects creating content in the deleted state', async () => {
    bodyState.current = { status: 'deleted', content: { title: 'Deleted' } }
    await expect(createHandler(event())).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Cannot create deleted content'
    })
  })
})
