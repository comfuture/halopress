import { z } from 'zod'

export const pageBlockKeys = ['pageHero', 'pageCard', 'pageCTA'] as const
export type PageBlockComponentKey = typeof pageBlockKeys[number]

export type StoredPageBlockAttrs = {
  component?: unknown
  props?: unknown
  advanced?: unknown
  media?: unknown
}

export function isSafePageUrl(value: string) {
  if (!value) return true
  if (value.startsWith('/') && !value.startsWith('//')) return true
  if (value.startsWith('#')) return true
  try {
    const parsed = new URL(value)
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol)
  } catch {
    return false
  }
}

const safeUrl = z.string().max(2048).refine(isSafePageUrl, 'Unsafe URL')

const text = z.string().max(500)
const description = z.string().max(5000)
const orientation = z.enum(['vertical', 'horizontal'])
const target = z.enum(['_self', '_blank'])
const variant = z.enum(['solid', 'outline', 'soft', 'subtle', 'ghost', 'naked'])
const color = z.enum(['primary', 'secondary', 'success', 'info', 'warning', 'error', 'neutral'])
const icon = z.string().max(100).regex(/^i-[a-z0-9-]+$/)

const link = z.object({
  label: text,
  to: safeUrl,
  target: target.optional(),
  icon: icon.optional(),
  color: color.optional(),
  variant: variant.optional()
})

const heroProps = z.object({
  headline: text.optional(),
  title: text.optional(),
  description: description.optional(),
  orientation: orientation.optional(),
  reverse: z.boolean().optional(),
  links: z.array(link).max(12).optional()
})

const cardProps = z.object({
  icon: icon.optional(),
  title: text.optional(),
  description: description.optional(),
  orientation: orientation.optional(),
  reverse: z.boolean().optional(),
  variant: variant.optional(),
  highlight: z.boolean().optional(),
  highlightColor: color.optional(),
  spotlight: z.boolean().optional(),
  spotlightColor: color.optional(),
  to: safeUrl.optional(),
  target: target.optional()
})

const ctaProps = z.object({
  title: text.optional(),
  description: description.optional(),
  orientation: orientation.optional(),
  reverse: z.boolean().optional(),
  variant: variant.optional(),
  links: z.array(link).max(12).optional()
})

const media = z.object({
  url: safeUrl.optional(),
  alt: z.string().max(500).optional(),
  width: z.number().int().positive().max(10000).optional(),
  height: z.number().int().positive().max(10000).optional()
})

const definitions = {
  pageHero: {
    componentName: 'UPageHero',
    defaultProps: { title: 'New Hero', description: '' },
    propsSchema: heroProps
  },
  pageCard: {
    componentName: 'UPageCard',
    defaultProps: { title: 'New Card', description: '' },
    propsSchema: cardProps
  },
  pageCTA: {
    componentName: 'UPageCTA',
    defaultProps: { title: 'New CTA', description: '' },
    propsSchema: ctaProps
  }
} as const

export const pageBlockDefinitions = definitions

export type ResolvedPageBlock =
  | {
      status: 'known'
      key: PageBlockComponentKey
      componentName: string
      props: Record<string, unknown>
      media: z.infer<typeof media>
    }
    | {
      status: 'unknown' | 'malformed'
      key: string
      reason: string
    }

export function isPageBlockComponentKey(value: unknown): value is PageBlockComponentKey {
  return typeof value === 'string' && Object.hasOwn(definitions, value)
}

export function resolvePageBlock(attrs: StoredPageBlockAttrs): ResolvedPageBlock {
  const key = typeof attrs.component === 'string' ? attrs.component : ''
  if (!isPageBlockComponentKey(key)) {
    return { status: 'unknown', key, reason: 'Unsupported page block' }
  }

  const definition = definitions[key]
  const rawProps = attrs.props && typeof attrs.props === 'object' && !Array.isArray(attrs.props)
    ? attrs.props as Record<string, unknown>
    : {}
  const parsedProps = definition.propsSchema.safeParse({ ...definition.defaultProps, ...rawProps })
  const parsedMedia = media.safeParse(
    attrs.media && typeof attrs.media === 'object' && !Array.isArray(attrs.media) ? attrs.media : {}
  )
  if (!parsedProps.success || !parsedMedia.success) {
    return { status: 'malformed', key, reason: 'Invalid page block properties' }
  }

  return {
    status: 'known',
    key,
    componentName: definition.componentName,
    props: parsedProps.data,
    media: parsedMedia.data
  }
}
