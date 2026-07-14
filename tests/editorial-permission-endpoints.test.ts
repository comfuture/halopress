import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

type EndpointHandler = (event: any) => Promise<any>

const permissionCalls = vi.hoisted(() => [] as string[])
const getDb = vi.hoisted(() => vi.fn())

vi.mock('../server/utils/schema-permission', () => ({
  requireSchemaPermission: vi.fn(async (_event: unknown, _schemaKey: string, action: string) => {
    permissionCalls.push(action)
    throw Object.assign(new Error('Permission denied'), { statusCode: 403, statusMessage: 'Permission denied' })
  })
}))
vi.mock('../server/db/db', () => ({ getDb }))
vi.mock('../server/utils/auth', () => ({ getAuthSession: vi.fn() }))
vi.mock('../server/utils/widget-cache', () => ({ queueWidgetCacheInvalidation: vi.fn() }))
vi.mock('h3', async (importOriginal) => ({
  ...await importOriginal<typeof import('h3')>(),
  readBody: vi.fn(async () => ({ revision: 1 }))
}))
vi.stubGlobal('defineEventHandler', (handler: EndpointHandler) => handler)

let publish: EndpointHandler
let archive: EndpointHandler
let remove: EndpointHandler

beforeAll(async () => {
  [publish, archive, remove] = await Promise.all([
    import('../server/api/content/[schemaKey]/[id]/publish.post').then(module => module.default as EndpointHandler),
    import('../server/api/content/[schemaKey]/[id]/unpublish.post').then(module => module.default as EndpointHandler),
    import('../server/api/content/[schemaKey]/[id].delete').then(module => module.default as EndpointHandler)
  ])
})

afterAll(() => {
  vi.unstubAllGlobals()
})

describe('editorial permission endpoints', () => {
  it.each([
    ['publish', () => publish],
    ['archive', () => archive],
    ['delete', () => remove]
  ])('rejects direct %s commands before touching the database', async (action, handler) => {
    permissionCalls.length = 0
    getDb.mockClear()
    await expect(handler()({ context: { params: { schemaKey: 'article', id: 'article-1' } } }))
      .rejects.toMatchObject({ statusCode: 403 })
    expect(permissionCalls).toEqual([action])
    expect(getDb).not.toHaveBeenCalled()
  })
})
