import { z } from 'zod'

import { publicNavigationDestinationSchema } from './site-presentation'

export const GLOBAL_SITE_MENU_ID = 'global-navigation'
export const GLOBAL_SITE_MENU_NAME = 'Global navigation'

export const SITE_MENU_ICONS = [
  'i-lucide-book-open',
  'i-lucide-circle-help',
  'i-lucide-file-text',
  'i-lucide-folder',
  'i-lucide-globe-2',
  'i-lucide-home',
  'i-lucide-info',
  'i-lucide-link',
  'i-lucide-mail',
  'i-lucide-menu',
  'i-lucide-newspaper',
  'i-lucide-search',
  'i-lucide-tag',
  'i-lucide-user',
  'i-lucide-users'
] as const

export const siteMenuIdSchema = z.string().trim().min(1).max(128).regex(
  /^[A-Za-z0-9][A-Za-z0-9._:-]*$/,
  'Use letters, numbers, dots, colons, underscores, or hyphens'
)

export const siteMenuNameSchema = z.string().trim().min(1, 'Enter a menu name').max(80)

/**
 * Stable application-side identity for menu names. SQLite's lower() only
 * handles ASCII, so storage must not derive Unicode uniqueness in SQL.
 */
export function siteMenuNameKey(name: string) {
  return name.trim().normalize('NFKC').toLowerCase()
}

export const siteMenuValueSchema = z.string().trim().min(1).max(128).regex(
  /^[A-Za-z0-9][A-Za-z0-9._:-]*$/,
  'Menu values may use letters, numbers, dots, colons, underscores, or hyphens'
)

export const siteMenuBadgeSchema = z.union([
  z.string().trim().min(1).max(24),
  z.number().finite()
])

export const siteMenuLeafSchema = z.object({
  id: siteMenuIdSchema,
  label: z.string().trim().min(1).max(80),
  destination: publicNavigationDestinationSchema,
  value: siteMenuValueSchema.optional(),
  icon: z.enum(SITE_MENU_ICONS).optional(),
  badge: siteMenuBadgeSchema.optional()
}).strict()

export const siteMenuItemSchema = siteMenuLeafSchema.extend({
  children: z.array(siteMenuLeafSchema).max(8).default([])
}).strict()

export const siteMenuDocumentSchema = z.object({
  version: z.literal(1),
  items: z.array(siteMenuItemSchema).max(12)
}).strict().superRefine((document, context) => {
  const ids = new Set<string>()
  const values = new Set<string>()

  for (const [itemIndex, item] of document.items.entries()) {
    const candidates = [
      { candidate: item, path: ['items', itemIndex] },
      ...item.children.map((candidate, childIndex) => ({
        candidate,
        path: ['items', itemIndex, 'children', childIndex]
      }))
    ]
    for (const { candidate, path } of candidates) {
      if (ids.has(candidate.id)) {
        context.addIssue({
          code: 'custom',
          message: `Menu item IDs must be unique: ${candidate.id}`,
          path: [...path, 'id']
        })
      }
      ids.add(candidate.id)

      const effectiveValue = candidate.value || candidate.id
      if (values.has(effectiveValue)) {
        context.addIssue({
          code: 'custom',
          message: `Menu item values must be unique: ${effectiveValue}`,
          path: [...path, 'value']
        })
      }
      values.add(effectiveValue)
    }
  }
})

function isSafeResolvedTarget(value: string) {
  if (value.startsWith('/') && !value.startsWith('//')) return true
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password
  } catch {
    return false
  }
}

export const resolvedSiteMenuTargetSchema = z.string().trim().min(1).max(2048).refine(
  isSafeResolvedTarget,
  'Use a canonical Site path or an absolute http or https URL without embedded credentials'
)

export const resolvedSiteMenuLeafSchema = z.object({
  id: siteMenuIdSchema,
  label: z.string().trim().min(1).max(80),
  to: resolvedSiteMenuTargetSchema,
  value: siteMenuValueSchema,
  icon: z.enum(SITE_MENU_ICONS).optional(),
  badge: siteMenuBadgeSchema.optional(),
  target: z.literal('_blank').optional(),
  rel: z.literal('noopener noreferrer').optional()
}).strict().superRefine((item, context) => {
  if (Boolean(item.target) !== Boolean(item.rel)) {
    context.addIssue({
      code: 'custom',
      message: 'External window targets must include noopener noreferrer',
      path: ['target']
    })
  }
})

export const resolvedSiteMenuItemSchema = resolvedSiteMenuLeafSchema.extend({
  children: z.array(resolvedSiteMenuLeafSchema).max(8).default([])
}).strict()

export const resolvedSiteMenuDocumentSchema = z.object({
  version: z.literal(1),
  items: z.array(resolvedSiteMenuItemSchema).max(12)
}).strict().superRefine((document, context) => {
  const ids = new Set<string>()
  const values = new Set<string>()
  for (const item of document.items) {
    for (const candidate of [item, ...item.children]) {
      if (ids.has(candidate.id)) {
        context.addIssue({ code: 'custom', message: `Menu item IDs must be unique: ${candidate.id}`, path: ['items'] })
      }
      ids.add(candidate.id)
      if (values.has(candidate.value)) {
        context.addIssue({ code: 'custom', message: `Menu item values must be unique: ${candidate.value}`, path: ['items'] })
      }
      values.add(candidate.value)
    }
  }
})

// Public delivery uses the validated resolved projection. It deliberately has
// no typed destination, so canonical targets can never be written back into the
// strict persisted document by mistake.
export const publicSiteMenuDocumentSchema = resolvedSiteMenuDocumentSchema

export const siteMenuCreateSchema = z.object({
  name: siteMenuNameSchema
}).strict()

export const siteMenuUpdateSchema = z.object({
  name: siteMenuNameSchema,
  document: siteMenuDocumentSchema
}).strict()

export type SiteMenuLeaf = z.output<typeof siteMenuLeafSchema>
export type SiteMenuItem = z.output<typeof siteMenuItemSchema>
export type SiteMenuDocument = z.output<typeof siteMenuDocumentSchema>
export type SiteMenuCreate = z.output<typeof siteMenuCreateSchema>
export type SiteMenuUpdate = z.output<typeof siteMenuUpdateSchema>
export type ResolvedSiteMenuLeaf = z.output<typeof resolvedSiteMenuLeafSchema>
export type ResolvedSiteMenuItem = z.output<typeof resolvedSiteMenuItemSchema>
export type ResolvedSiteMenuDocument = z.output<typeof resolvedSiteMenuDocumentSchema>
export type PublicSiteMenuDocument = ResolvedSiteMenuDocument

export type SiteMenuUsage = {
  resourceType: 'public-site-shell' | 'site-layout'
  resourceId: string
  label: string
}

export type SiteMenuValidationIssue = {
  path: string
  message: string
}

export type SiteMenuAdminResource = {
  id: string
  name: string
  document: SiteMenuDocument
  malformedStoredValue: boolean
  createdBy: string | null
  updatedBy: string | null
  createdAt: string
  updatedAt: string
  usage: SiteMenuUsage[]
  canDelete: boolean
}

export type SiteMenuListResponse = {
  defaultMenuId: typeof GLOBAL_SITE_MENU_ID
  items: SiteMenuAdminResource[]
}

export type PublicSiteMenu = {
  id: string
  name: string
  document: PublicSiteMenuDocument
}

export function defaultSiteMenuDocument(): SiteMenuDocument {
  return { version: 1, items: [] }
}

export function siteMenuItemValue(item: SiteMenuLeaf) {
  return item.value || item.id
}
