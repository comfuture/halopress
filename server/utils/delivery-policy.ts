import type { H3Event } from 'h3'
import { setHeader } from 'h3'
import { eq } from 'drizzle-orm'

import { getDb } from '../db/db'
import { content as contentTable } from '../db/schema'
import { notFound } from './http'
import { getSchemaPermission, hasSchemaPermission, type SchemaPermission } from './schema-permission'

export type DeliveryStatus = string | null

export type DeliveryPolicy = {
  permission: SchemaPermission
  isPublic: boolean
  effectiveStatus: DeliveryStatus
  cacheVisibility: string
  canUsePublicCache: boolean
}

type DeliveryStatusInput = {
  roleKey: string
  requestedStatus?: unknown
  defaultStatus?: DeliveryStatus
}

/**
 * Anonymous delivery is always published-only. Any authenticated role with
 * effective schema read permission keeps its existing Desk status access,
 * including unrestricted reads when status is omitted or set to `all`.
 */
export function normalizeDeliveryStatus({
  roleKey,
  requestedStatus,
  defaultStatus = null
}: DeliveryStatusInput): DeliveryStatus {
  if (roleKey === 'anonymous') return 'published'

  const requested = typeof requestedStatus === 'string' && requestedStatus.trim().length
    ? requestedStatus.trim()
    : defaultStatus

  return requested === 'all' ? null : requested
}

export async function resolveDeliveryPolicy(
  event: H3Event,
  schemaKey: string,
  options: { requestedStatus?: unknown; defaultStatus?: DeliveryStatus } = {}
): Promise<DeliveryPolicy> {
  const permission = await getSchemaPermission(event, schemaKey)
  if (!hasSchemaPermission(permission, 'read')) {
    throw notFound('Schema not found')
  }

  const isPublic = permission.roleKey === 'anonymous'
  const effectiveStatus = normalizeDeliveryStatus({
    roleKey: permission.roleKey,
    requestedStatus: options.requestedStatus,
    defaultStatus: options.defaultStatus
  })

  return {
    permission,
    isPublic,
    effectiveStatus,
    cacheVisibility: isPublic ? 'public:published' : `authenticated:${permission.roleKey}`,
    canUsePublicCache: isPublic
  }
}

export async function requirePublicContentOwner(event: H3Event, ownerId: string) {
  const db = await getDb(event)
  const owner = await db
    .select({
      schemaKey: contentTable.schemaKey,
      status: contentTable.status,
      updatedAt: contentTable.updatedAt
    })
    .from(contentTable)
    .where(eq(contentTable.id, ownerId))
    .get()

  if (!owner || owner.status !== 'published') {
    throw notFound('Content not found')
  }

  await resolveDeliveryPolicy(event, owner.schemaKey, { defaultStatus: 'published' })
  return owner
}

export function applyPrivateDeliveryHeaders(event: H3Event) {
  setHeader(event, 'Cache-Control', 'private, no-store')
  setHeader(event, 'Vary', 'Cookie')
}
