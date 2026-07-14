import type { H3Event } from 'h3'
import { inArray } from 'drizzle-orm'

import {
  defaultSitePresentation,
  sitePresentationPatchSchema,
  sitePresentationSchema,
  toPublicSitePresentation,
  type PublicSitePresentation,
  type SitePresentation
} from '../../shared/site-presentation'
import { syncDocumentAssetRefs } from '../cms/asset-refs'
import { getDb } from '../db/db'
import { asset as assetTable } from '../db/schema'
import { getSetting, upsertSetting } from './settings'
import { canonicalPathMap, type PublicDocumentKind } from '../cms/public-routes'

export const SITE_PRESENTATION_SETTING_KEY = 'site.presentation'
export const SITE_PRESENTATION_GROUP = 'site.presentation'

export class SitePresentationValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SitePresentationValidationError'
  }
}

type ResolvedSitePresentation = {
  value: SitePresentation
  configured: boolean
  malformedStoredValue: boolean
  updatedAt: Date | null
  updatedBy: string | null
}

export type SitePresentationAdminResponse = ResolvedSitePresentation & {
  management: {
    source: 'default' | 'desk'
    editable: true
    secret: false
  }
  missingAssetIds: string[]
}

function brandingAssetIds(value: SitePresentation) {
  return [
    value.general.logoAssetId,
    value.general.faviconAssetId,
    value.general.socialImageAssetId
  ].filter((assetId): assetId is string => Boolean(assetId))
}

function revisionFor(value: SitePresentation) {
  const input = JSON.stringify(value)
  let hash = 2166136261
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `v1-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

export function parseStoredSitePresentation(row: Awaited<ReturnType<typeof getSetting>>): ResolvedSitePresentation {
  if (!row) {
    return {
      value: defaultSitePresentation(),
      configured: false,
      malformedStoredValue: false,
      updatedAt: null,
      updatedBy: null
    }
  }

  if (row.isEncrypted || row.valueType !== 'json') {
    return {
      value: defaultSitePresentation(),
      configured: true,
      malformedStoredValue: true,
      updatedAt: row.updatedAt,
      updatedBy: row.updatedBy ?? null
    }
  }

  try {
    const parsed = sitePresentationSchema.safeParse(JSON.parse(row.value))
    if (parsed.success) {
      return {
        value: parsed.data,
        configured: true,
        malformedStoredValue: false,
        updatedAt: row.updatedAt,
        updatedBy: row.updatedBy ?? null
      }
    }
  } catch {
    // Fall through to the intentional, public-safe defaults.
  }

  return {
    value: defaultSitePresentation(),
    configured: true,
    malformedStoredValue: true,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy ?? null
  }
}

async function resolveSitePresentation(event: H3Event) {
  return parseStoredSitePresentation(await getSetting('global', SITE_PRESENTATION_SETTING_KEY, event))
}

async function availableBrandingAssetIds(event: H3Event, value: SitePresentation) {
  const ids = [...new Set(brandingAssetIds(value))]
  if (!ids.length) return new Set<string>()

  const db = await getDb(event)
  const rows = await db.select({
    id: assetTable.id,
    kind: assetTable.kind,
    status: assetTable.status,
    mimeType: assetTable.mimeType
  }).from(assetTable).where(inArray(assetTable.id, ids))

  return new Set<string>(rows
    .filter((row: { kind: string, status: string, mimeType: string }) => row.kind === 'image' && row.status === 'ready' && row.mimeType.startsWith('image/'))
    .map((row: { id: string }) => row.id))
}

export async function getSitePresentationAdmin(event: H3Event): Promise<SitePresentationAdminResponse> {
  const resolved = await resolveSitePresentation(event)
  const availableIds = await availableBrandingAssetIds(event, resolved.value)
  const missingAssetIds = brandingAssetIds(resolved.value).filter(assetId => !availableIds.has(assetId))
  return {
    ...resolved,
    management: {
      source: resolved.configured ? 'desk' : 'default',
      editable: true,
      secret: false
    },
    missingAssetIds
  }
}

export async function getPublicSitePresentation(event: H3Event): Promise<PublicSitePresentation> {
  const resolved = await resolveSitePresentation(event)
  const availableIds = await availableBrandingAssetIds(event, resolved.value)
  const presentation = toPublicSitePresentation(resolved.value, availableIds, revisionFor(resolved.value))
  const destinations = [
    ...presentation.navigation.items.flatMap(item => [item.destination, ...item.children.map(child => child.destination)]),
    ...presentation.footer.links.map(item => item.destination)
  ]
  const identities = destinations.flatMap((destination) => {
    if (destination.type === 'page') return [{ documentKind: 'page' as PublicDocumentKind, documentId: destination.pageId }]
    if (destination.type === 'collection') return [{ documentKind: 'schema' as PublicDocumentKind, documentId: destination.schemaKey }]
    if (destination.type === 'content') return [{ documentKind: 'content' as PublicDocumentKind, documentId: destination.contentId }]
    return []
  })
  const paths = await canonicalPathMap(await getDb(event), identities)
  const withPath = (destination: typeof destinations[number]) => {
    const key = destination.type === 'page'
      ? `page:${destination.pageId}`
      : destination.type === 'collection'
        ? `schema:${destination.schemaKey}`
        : destination.type === 'content'
          ? `content:${destination.contentId}`
          : null
    return key && paths.get(key) ? { ...destination, publicPath: paths.get(key)! } : destination
  }
  return {
    ...presentation,
    navigation: {
      items: presentation.navigation.items.map(item => ({
        ...item,
        destination: withPath(item.destination),
        children: item.children.map(child => ({ ...child, destination: withPath(child.destination) }))
      }))
    },
    footer: {
      ...presentation.footer,
      links: presentation.footer.links.map(item => ({ ...item, destination: withPath(item.destination) }))
    }
  } as PublicSitePresentation
}

export async function updateSitePresentation(
  event: H3Event,
  body: unknown,
  actorId: string | null
): Promise<SitePresentationAdminResponse> {
  const parsedPatch = sitePresentationPatchSchema.safeParse(body)
  if (!parsedPatch.success) {
    throw new SitePresentationValidationError(parsedPatch.error.issues[0]?.message || 'Invalid site presentation settings')
  }

  const current = await resolveSitePresentation(event)
  const nextResult = sitePresentationSchema.safeParse({
    ...current.value,
    ...parsedPatch.data
  })
  if (!nextResult.success) {
    throw new SitePresentationValidationError(nextResult.error.issues[0]?.message || 'Invalid site presentation settings')
  }
  const next = nextResult.data
  const availableIds = await availableBrandingAssetIds(event, next)
  const missingAssetIds = brandingAssetIds(next).filter(assetId => !availableIds.has(assetId))
  if (missingAssetIds.length) {
    throw new SitePresentationValidationError(`Choose ready image assets for branding: ${missingAssetIds.join(', ')}`)
  }

  await upsertSetting({
    scope: 'global',
    key: SITE_PRESENTATION_SETTING_KEY,
    value: JSON.stringify(next),
    valueType: 'json',
    isEncrypted: false,
    groupKey: SITE_PRESENTATION_GROUP,
    updatedBy: actorId,
    note: 'Managed from Desk site presentation settings'
  }, event)

  const db = await getDb(event)
  await syncDocumentAssetRefs({
    db,
    documentKind: 'settings',
    documentId: SITE_PRESENTATION_SETTING_KEY,
    projectionScope: 'published',
    content: null,
    additionalAssetIds: brandingAssetIds(next)
  })

  return await getSitePresentationAdmin(event)
}
