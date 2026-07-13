import { and, eq } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { listActiveSchemas } from '../server/cms/repo'
import {
  content as contentTable,
  contentListing as contentListingTable,
  schema as schemaTable,
  schemaActive as schemaActiveTable,
  schemaRole as schemaRoleTable
} from '../server/db/schema'
import {
  applyPrivateDeliveryHeaders,
  normalizeDeliveryStatus,
  requirePublicContentOwner,
  resolveDeliveryPolicy
} from '../server/utils/delivery-policy'
import type { SchemaPermission } from '../server/utils/schema-permission'
import { runMigrations, seedRoles } from '../server/utils/install'
import { createTestSqliteDb } from './fixtures/sqlite'

const permissionState = vi.hoisted(() => ({
  current: {
    roleKey: 'anonymous',
    canRead: true,
    canWrite: false,
    canAdmin: false
  } as SchemaPermission
}))
const dbState = vi.hoisted(() => ({ current: null as any }))

vi.mock('../server/db/db', () => ({
  getDb: vi.fn(async () => dbState.current)
}))

vi.mock('../server/utils/schema-permission', () => ({
  getSchemaPermission: vi.fn(async () => permissionState.current),
  hasSchemaPermission: (permission: SchemaPermission, action: 'read' | 'write' | 'admin') => {
    if (action === 'read') return permission.canRead || permission.canWrite || permission.canAdmin
    if (action === 'write') return permission.canWrite || permission.canAdmin
    return permission.canAdmin
  }
}))

function permission(overrides: Partial<SchemaPermission>): SchemaPermission {
  return {
    roleKey: 'user',
    canRead: false,
    canWrite: false,
    canAdmin: false,
    ...overrides
  }
}

async function addActiveSchema(db: any, schemaKey: string, title: string) {
  const now = new Date()
  await db.insert(schemaTable).values({
    schemaKey,
    version: 1,
    title,
    astJson: JSON.stringify({ schemaKey, title, fields: [] }),
    jsonSchema: JSON.stringify({ type: 'object', properties: {} }),
    createdAt: now
  })
  await db.insert(schemaActiveTable).values({
    schemaKey,
    activeVersion: 1,
    updatedAt: now
  })
}

async function addContentOwner(db: any, args: { id: string; schemaKey: string; status: string }) {
  const now = new Date()
  await db.insert(contentTable).values({
    id: args.id,
    schemaKey: args.schemaKey,
    schemaVersion: 1,
    status: args.status,
    contentJson: '{}',
    createdAt: now,
    updatedAt: now
  })
  await db.insert(contentListingTable).values({
    contentId: args.id,
    schemaKey: args.schemaKey,
    schemaVersion: 1,
    status: args.status,
    createdAt: now,
    updatedAt: now
  })
}

describe('public delivery policy', () => {
  afterEach(() => {
    permissionState.current = permission({
      roleKey: 'anonymous',
      canRead: true
    })
    dbState.current = null
  })

  it.each([
    { requestedStatus: undefined, defaultStatus: null },
    { requestedStatus: 'published', defaultStatus: null },
    { requestedStatus: 'draft', defaultStatus: null },
    { requestedStatus: 'deleted', defaultStatus: null },
    { requestedStatus: 'archived', defaultStatus: null },
    { requestedStatus: 'all', defaultStatus: null },
    { requestedStatus: undefined, defaultStatus: 'draft' }
  ])('clamps anonymous status $requestedStatus to published', ({ requestedStatus, defaultStatus }) => {
    expect(normalizeDeliveryStatus({
      roleKey: 'anonymous',
      requestedStatus,
      defaultStatus
    })).toBe('published')
  })

  it.each([
    {
      label: 'read-only',
      permission: permission({ roleKey: 'user', canRead: true }),
      requestedStatus: 'draft',
      effectiveStatus: 'draft'
    },
    {
      label: 'writer',
      permission: permission({ roleKey: 'writer', canWrite: true }),
      requestedStatus: 'deleted',
      effectiveStatus: 'deleted'
    },
    {
      label: 'schema admin',
      permission: permission({ roleKey: 'schema-admin', canAdmin: true }),
      requestedStatus: 'archived',
      effectiveStatus: 'archived'
    },
    {
      label: 'global admin',
      permission: permission({ roleKey: 'admin', canRead: true, canWrite: true, canAdmin: true }),
      requestedStatus: 'all',
      effectiveStatus: null
    }
  ])('preserves authorized $label status access', async ({ permission: rolePermission, requestedStatus, effectiveStatus }) => {
    permissionState.current = rolePermission

    const policy = await resolveDeliveryPolicy({} as any, 'article', { requestedStatus })

    expect(policy).toMatchObject({
      permission: rolePermission,
      isPublic: false,
      effectiveStatus,
      cacheVisibility: `authenticated:${rolePermission.roleKey}`,
      canUsePublicCache: false
    })
  })

  it('normalizes omitted and all statuses to an unrestricted authenticated query', () => {
    expect(normalizeDeliveryStatus({ roleKey: 'user', requestedStatus: undefined })).toBeNull()
    expect(normalizeDeliveryStatus({ roleKey: 'user', requestedStatus: 'all' })).toBeNull()
    expect(normalizeDeliveryStatus({
      roleKey: 'user',
      requestedStatus: undefined,
      defaultStatus: 'published'
    })).toBe('published')
  })

  it('returns a non-enumerating 404 when the role cannot read the schema', async () => {
    permissionState.current = permission({ roleKey: 'anonymous' })

    await expect(resolveDeliveryPolicy({} as any, 'private-schema')).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Schema not found'
    })
  })

  it('marks authenticated delivery responses private and cookie-varying', () => {
    const setHeader = vi.fn()
    const event = {
      node: {
        res: { setHeader }
      }
    }

    applyPrivateDeliveryHeaders(event as any)

    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store')
    expect(setHeader).toHaveBeenCalledWith('Vary', 'Cookie')
  })
})

describe('public curation owners', () => {
  it.each(['draft', 'deleted'])('hides a %s owner before its references can be delivered', async (status) => {
    const fixture = await createTestSqliteDb()
    const { db } = fixture

    try {
      await runMigrations(db)
      await seedRoles(db)
      await addActiveSchema(db, 'curation', 'Curation')
      await addContentOwner(db, { id: `owner-${status}`, schemaKey: 'curation', status })
      dbState.current = db

      await expect(requirePublicContentOwner({} as any, `owner-${status}`)).rejects.toMatchObject({
        statusCode: 404,
        statusMessage: 'Content not found'
      })
    } finally {
      fixture.close()
    }
  })

  it('requires anonymous schema read permission for a published owner', async () => {
    const fixture = await createTestSqliteDb()
    const { db } = fixture

    try {
      await runMigrations(db)
      await seedRoles(db)
      await addActiveSchema(db, 'private-curation', 'Private curation')
      await addContentOwner(db, { id: 'owner-private', schemaKey: 'private-curation', status: 'published' })
      dbState.current = db
      permissionState.current = permission({ roleKey: 'anonymous' })

      await expect(requirePublicContentOwner({} as any, 'owner-private')).rejects.toMatchObject({
        statusCode: 404,
        statusMessage: 'Schema not found'
      })
    } finally {
      fixture.close()
    }
  })

  it('accepts a published owner in an anonymously readable schema', async () => {
    const fixture = await createTestSqliteDb()
    const { db } = fixture

    try {
      await runMigrations(db)
      await seedRoles(db)
      await addActiveSchema(db, 'public-curation', 'Public curation')
      await addContentOwner(db, { id: 'owner-public', schemaKey: 'public-curation', status: 'published' })
      dbState.current = db
      permissionState.current = permission({ roleKey: 'anonymous', canRead: true })

      await expect(requirePublicContentOwner({} as any, 'owner-public')).resolves.toMatchObject({
        schemaKey: 'public-curation',
        status: 'published'
      })
    } finally {
      fixture.close()
    }
  })
})

describe('permission-aware schema discovery', () => {
  it('filters by effective role read access and reflects anonymous revocation', async () => {
    const fixture = await createTestSqliteDb()
    const { db } = fixture

    try {
      await runMigrations(db)
      await seedRoles(db)

      await addActiveSchema(db, 'public', 'Public')
      await addActiveSchema(db, 'readable', 'Readable')
      await addActiveSchema(db, 'writable', 'Writable')
      await addActiveSchema(db, 'manageable', 'Manageable')
      await addActiveSchema(db, 'private', 'Private')

      await db.insert(schemaRoleTable).values([
        { schemaKey: 'public', roleKey: 'anonymous', canRead: true, canWrite: false, canAdmin: false },
        { schemaKey: 'readable', roleKey: 'user', canRead: true, canWrite: false, canAdmin: false },
        { schemaKey: 'writable', roleKey: 'user', canRead: false, canWrite: true, canAdmin: false },
        { schemaKey: 'manageable', roleKey: 'user', canRead: false, canWrite: false, canAdmin: true },
        { schemaKey: 'private', roleKey: 'user', canRead: false, canWrite: false, canAdmin: false }
      ])

      await expect(listActiveSchemas(db, { roleKey: 'anonymous' })).resolves.toEqual([
        expect.objectContaining({ schemaKey: 'public', title: 'Public' })
      ])
      await expect(listActiveSchemas(db, { roleKey: 'user' })).resolves.toEqual([
        expect.objectContaining({ schemaKey: 'manageable' }),
        expect.objectContaining({ schemaKey: 'readable' }),
        expect.objectContaining({ schemaKey: 'writable' })
      ])
      expect((await listActiveSchemas(db)).map(item => item.schemaKey)).toEqual([
        'manageable',
        'private',
        'public',
        'readable',
        'writable'
      ])

      await db
        .update(schemaRoleTable)
        .set({ canRead: false })
        .where(and(
          eq(schemaRoleTable.schemaKey, 'public'),
          eq(schemaRoleTable.roleKey, 'anonymous')
        ))

      await expect(listActiveSchemas(db, { roleKey: 'anonymous' })).resolves.toEqual([])
    } finally {
      fixture.close()
    }
  })
})
