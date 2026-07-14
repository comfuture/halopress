import { z } from 'zod'

export const pageBlockKeys = [
  'pageHero',
  'pageCard',
  'pageSection',
  'pageTestimonial',
  'pageLogos',
  'pageFAQ',
  'pageCTA'
] as const
export type PageBlockComponentKey = typeof pageBlockKeys[number]

export type StoredPageBlockAttrs = {
  component?: unknown
  props?: unknown
  advanced?: unknown
  media?: unknown
}

export type PageBlockValidationIssue = {
  index: number
  key: string
  kind: 'unknown' | 'malformed'
  message: string
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

const feature = z.object({
  title: text,
  description: description.optional(),
  icon: icon.optional(),
  orientation: orientation.optional(),
  to: safeUrl.optional(),
  target: target.optional()
})

const sectionProps = z.object({
  headline: text.optional(),
  title: text.optional(),
  description: description.optional(),
  icon: icon.optional(),
  orientation: orientation.optional(),
  reverse: z.boolean().optional(),
  features: z.array(feature).max(6).optional(),
  links: z.array(link).max(12).optional()
})

const testimonialProps = z.object({
  quote: description.optional(),
  author: text.optional(),
  role: text.optional(),
  company: text.optional()
})

const logoItem = z.object({
  name: text,
  src: safeUrl.optional(),
  alt: text.optional()
})

const logosProps = z.object({
  title: text.optional(),
  items: z.array(logoItem).max(12).optional()
})

const faqItem = z.object({
  question: text,
  answer: description
})

const faqProps = z.object({
  headline: text.optional(),
  title: text.optional(),
  description: description.optional(),
  items: z.array(faqItem).max(12).optional()
})

const heroPatternProps = z.object({
  headline: text.optional(),
  title: text.optional(),
  description: description.optional(),
  orientation: orientation.optional(),
  reverse: z.boolean().optional(),
  links: z.array(link.strict()).max(12).optional()
}).strict()

const sectionPatternProps = z.object({
  headline: text.optional(),
  title: text.optional(),
  description: description.optional(),
  icon: icon.optional(),
  orientation: orientation.optional(),
  reverse: z.boolean().optional(),
  features: z.array(feature.strict()).max(6).optional(),
  links: z.array(link.strict()).max(12).optional()
}).strict()

const logosPatternProps = z.object({
  title: text.optional(),
  items: z.array(logoItem.strict()).max(12).optional()
}).strict()

const faqPatternProps = z.object({
  headline: text.optional(),
  title: text.optional(),
  description: description.optional(),
  items: z.array(faqItem.strict()).max(12).optional()
}).strict()

const ctaPatternProps = z.object({
  title: text.optional(),
  description: description.optional(),
  orientation: orientation.optional(),
  reverse: z.boolean().optional(),
  variant: variant.optional(),
  links: z.array(link.strict()).max(12).optional()
}).strict()

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
  height: z.number().int().positive().max(10000).optional(),
  requiredAction: z.string().max(500).optional()
})

const definitions = {
  pageHero: {
    componentName: 'UPageHero',
    defaultProps: { title: 'New Hero', description: '' },
    propsSchema: heroProps,
    patternPropsSchema: heroPatternProps
  },
  pageCard: {
    componentName: 'UPageCard',
    defaultProps: { title: 'New Card', description: '' },
    propsSchema: cardProps,
    patternPropsSchema: cardProps.strict()
  },
  pageSection: {
    componentName: 'UPageSection',
    defaultProps: { title: 'New Section', description: '' },
    propsSchema: sectionProps,
    patternPropsSchema: sectionPatternProps
  },
  pageTestimonial: {
    componentName: 'PageBlockTestimonial',
    defaultProps: { quote: '[Add a customer quote]', author: '[Add the customer name]' },
    propsSchema: testimonialProps,
    patternPropsSchema: testimonialProps.strict()
  },
  pageLogos: {
    componentName: 'PageBlockLogos',
    defaultProps: { title: 'Trusted by teams like yours', items: [] },
    propsSchema: logosProps,
    patternPropsSchema: logosPatternProps
  },
  pageFAQ: {
    componentName: 'PageBlockFAQ',
    defaultProps: { title: 'Frequently asked questions', items: [] },
    propsSchema: faqProps,
    patternPropsSchema: faqPatternProps
  },
  pageCTA: {
    componentName: 'UPageCTA',
    defaultProps: { title: 'New CTA', description: '' },
    propsSchema: ctaProps,
    patternPropsSchema: ctaPatternProps
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

export function isValidCuratedPageBlockAttrs(attrs: StoredPageBlockAttrs) {
  const allowedAttrs = new Set(['component', 'props', 'advanced', 'media'])
  if (Object.keys(attrs).some(key => !allowedAttrs.has(key))) return false
  const key = typeof attrs.component === 'string' ? attrs.component : ''
  if (!isPageBlockComponentKey(key)) return false
  if (!attrs.props || typeof attrs.props !== 'object' || Array.isArray(attrs.props)) return false
  if (attrs.advanced !== undefined) {
    if (!attrs.advanced || typeof attrs.advanced !== 'object' || Array.isArray(attrs.advanced)) return false
    if (Object.keys(attrs.advanced as Record<string, unknown>).length) return false
  }
  const rawMedia = attrs.media ?? {}
  if (!rawMedia || typeof rawMedia !== 'object' || Array.isArray(rawMedia)) return false
  return definitions[key].patternPropsSchema.safeParse(attrs.props).success
    && media.strict().safeParse(rawMedia).success
}

export function validatePageDocumentBlocks(
  value: unknown,
  options: { allowUnknown?: boolean } = {}
): PageBlockValidationIssue[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  const content = (value as Record<string, unknown>).content
  if (!Array.isArray(content)) return []

  const issues: PageBlockValidationIssue[] = []
  content.forEach((candidate, index) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return
    const node = candidate as Record<string, unknown>
    if (node.type !== 'pageBlock') return
    const attrs = node.attrs && typeof node.attrs === 'object' && !Array.isArray(node.attrs)
      ? node.attrs as StoredPageBlockAttrs
      : {}
    const resolved = resolvePageBlock(attrs)
    if (resolved.status === 'known') return
    if (resolved.status === 'unknown' && options.allowUnknown) return
    issues.push({
      index,
      key: resolved.key,
      kind: resolved.status,
      message: resolved.status === 'unknown'
        ? `Block ${index + 1} uses an unsupported component${resolved.key ? ` (${resolved.key})` : ''}.`
        : `Block ${index + 1}${resolved.key ? ` (${resolved.key})` : ''} has invalid properties.`
    })
  })
  return issues
}
