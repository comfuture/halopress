import {
  hasUnsafePortableUrlCharacters,
  isPortablePageAssetPath,
  resolvePageBlockForDelivery,
  type pageBlockIconKeys,
  type StoredPageBlockAttrs
} from './page-blocks'

export const PORTABLE_CONTENT_CONTRACT_VERSION = 1 as const
export const PORTABLE_CONTENT_STYLESHEET_REVISION = 'dfea71d319d9c7d0a48d19346c115d3bd32a51e0b88f30e4c344cb454b9ea3f1'
export const PORTABLE_CONTENT_STYLESHEET_PATH = `/_halo/content/v1/${PORTABLE_CONTENT_STYLESHEET_REVISION}.css`
export const PORTABLE_CONTENT_THEME_REVISION = 'default'

export type PortableRenderingBase = {
  contractVersion: typeof PORTABLE_CONTENT_CONTRACT_VERSION
  stylesheets: string[]
  themeRevision: typeof PORTABLE_CONTENT_THEME_REVISION
}

export type PortableDocumentRendering = PortableRenderingBase & {
  html: string
}

export type PortableRichTextFieldRendering = {
  fieldId: string
  fieldKey: string
  html: string
}

export type PortableStructuredContentRendering = PortableRenderingBase & {
  fields: Record<string, PortableRichTextFieldRendering>
  truncated?: true
}

export type PortableRenderLimits = {
  maxDepth: number
  maxNodes: number
  maxMarks: number
  maxFields: number
  maxSchemaFields: number
  maxOutputLength: number
}

export type PortableRenderOptions = {
  origin: string
  limits?: Partial<PortableRenderLimits>
}

export type PortableSchemaField = {
  fieldId: string
  key: string
  kind: string
}

const defaultLimits: PortableRenderLimits = {
  maxDepth: 32,
  maxNodes: 2_000,
  maxMarks: 4_096,
  maxFields: 256,
  maxSchemaFields: 4_096,
  maxOutputLength: 512 * 1024
}

const plainMarkTags: Record<string, string> = {
  bold: 'strong',
  italic: 'em',
  strike: 's',
  code: 'code',
  underline: 'u'
}

const supportedAlignments = new Set(['left', 'center', 'right', 'justify'])

const portableIconSvg = {
  'i-lucide-arrow-right': '<path d="M5 12h14"></path><path d="m13 6 6 6-6 6"></path>',
  'i-lucide-badge-check': '<path d="M7.2 3.5 12 2l4.8 1.5 2.7 4.2-.2 5-3.1 3.9L12 19l-4.2-2.4-3.1-3.9-.2-5z"></path><path d="m8.5 11.5 2.2 2.2 4.8-5"></path>',
  'i-lucide-book-open': '<path d="M2 4.5A2.5 2.5 0 0 1 4.5 2H10a2 2 0 0 1 2 2v16a2 2 0 0 0-2-2H4.5A2.5 2.5 0 0 0 2 20.5z"></path><path d="M22 4.5A2.5 2.5 0 0 0 19.5 2H14a2 2 0 0 0-2 2v16a2 2 0 0 1 2-2h5.5a2.5 2.5 0 0 1 2.5 2.5z"></path>',
  'i-lucide-circle-help': '<circle cx="12" cy="12" r="9"></circle><path d="M9.5 9a2.5 2.5 0 1 1 3.7 2.2c-.8.4-1.2.9-1.2 1.8"></path><path d="M12 17h.01"></path>',
  'i-lucide-external-link': '<path d="M15 3h6v6"></path><path d="m10 14 11-11"></path><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>',
  'i-lucide-heart': '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8z"></path>',
  'i-lucide-sparkles': '<path d="m12 3-1.2 3.3L7.5 7.5l3.3 1.2L12 12l1.2-3.3 3.3-1.2-3.3-1.2z"></path><path d="m5 13-.8 2.2L2 16l2.2.8L5 19l.8-2.2L8 16l-2.2-.8z"></path><path d="m18 14-1 2.7-2.7 1L17 18.8l1 2.7 1-2.7 2.7-1-2.7-1z"></path>',
  'i-lucide-star': '<path d="m12 2.5 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3.1-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9z"></path>'
} satisfies Record<typeof pageBlockIconKeys[number], string>

class PortableRenderBudgetError extends Error {}

class PortableBudget {
  private outputLength = 0
  private nodes = 0
  private marks = 0
  private fields = 0
  exceeded = false

  constructor(private readonly limits: PortableRenderLimits) {}

  claimNode(depth: number) {
    this.nodes += 1
    if (depth > this.limits.maxDepth || this.nodes > this.limits.maxNodes) {
      this.exceeded = true
      throw new PortableRenderBudgetError('Portable rendering budget exceeded')
    }
  }

  claimMark() {
    this.marks += 1
    if (this.marks > this.limits.maxMarks) {
      this.exceeded = true
      throw new PortableRenderBudgetError('Portable rendering budget exceeded')
    }
  }

  claimField(fieldId: string, fieldKey: string) {
    this.fields += 1
    if (this.fields > this.limits.maxFields) {
      this.exceeded = true
      throw new PortableRenderBudgetError('Portable rendering budget exceeded')
    }
    this.charge(fieldId.length + fieldKey.length + 64)
  }

  charge(length: number) {
    this.outputLength += length
    if (this.outputLength > this.limits.maxOutputLength) {
      this.exceeded = true
      throw new PortableRenderBudgetError('Portable rendering budget exceeded')
    }
  }

  remainingOutput() {
    return this.limits.maxOutputLength - this.outputLength
  }

  checkpoint() {
    return {
      outputLength: this.outputLength,
      nodes: this.nodes,
      marks: this.marks,
      fields: this.fields
    }
  }

  recover(checkpoint: ReturnType<PortableBudget['checkpoint']>) {
    this.outputLength = checkpoint.outputLength
    this.nodes = checkpoint.nodes
    this.marks = checkpoint.marks
    this.fields = checkpoint.fields
    this.exceeded = true
  }

  reject(): never {
    this.exceeded = true
    throw new PortableRenderBudgetError('Portable rendering budget exceeded')
  }
}

class PortableWriter {
  private readonly parts: string[] = []

  constructor(private readonly budget: PortableBudget) {}

  claimNode(depth: number) {
    this.budget.claimNode(depth)
  }

  claimMark() {
    this.budget.claimMark()
  }

  push(value: string) {
    this.budget.charge(value.length)
    this.parts.push(value)
  }

  escaped(value: unknown) {
    const text = typeof value === 'string' ? value : String(value ?? '')
    if (text.length > this.budget.remainingOutput()) {
      this.budget.reject()
    }
    this.push(escapePortableHtml(text))
  }

  attribute(name: string, value: string | number | undefined) {
    if (value === undefined) return
    this.push(` ${name}="`)
    this.escaped(value)
    this.push('"')
  }

  toString() {
    return this.parts.join('')
  }
}

function renderingLimits(limits: PortableRenderOptions['limits']): PortableRenderLimits {
  const normalized = { ...defaultLimits, ...limits }
  for (const key of Object.keys(defaultLimits) as Array<keyof PortableRenderLimits>) {
    if (!Number.isSafeInteger(normalized[key]) || normalized[key] < 1) {
      throw new TypeError(`Invalid portable rendering limit: ${key}`)
    }
  }
  return normalized
}

export function escapePortableHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    '\'': '&#39;'
  })[character]!)
}

export function normalizePortableOrigin(value: string) {
  const parsed = new URL(value)
  if (!['http:', 'https:'].includes(parsed.protocol)
    || parsed.username
    || parsed.password
    || parsed.pathname !== '/'
    || parsed.search
    || parsed.hash) {
    throw new TypeError('Portable rendering requires a trusted HTTP(S) origin')
  }
  return parsed.origin
}

export function resolvePortableLinkUrl(value: unknown, origin: string) {
  if (typeof value !== 'string') return null
  const candidate = value.trim()
  if (!candidate
    || candidate.length > 2_048
    || candidate.startsWith('//')
    || hasUnsafePortableUrlCharacters(candidate)) return null
  if (candidate.startsWith('#')) return candidate
  try {
    const parsed = new URL(candidate, normalizePortableOrigin(origin))
    if (parsed.username || parsed.password) return null
    if (!['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol)) return null
    return parsed.href
  } catch {
    return null
  }
}

export function resolvePortableAssetUrl(value: unknown, origin: string) {
  if (typeof value !== 'string') return null
  const candidate = value.trim()
  if (!candidate
    || candidate.length > 2_048
    || candidate.startsWith('//')
    || hasUnsafePortableUrlCharacters(candidate)) return null
  try {
    const trustedOrigin = normalizePortableOrigin(origin)
    const parsed = new URL(candidate, trustedOrigin)
    if (parsed.username || parsed.password) return null
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== trustedOrigin) return null
    return parsed.href
  } catch {
    return null
  }
}

export function resolvePortablePageAssetUrl(value: unknown, origin: string) {
  const resolved = resolvePortableAssetUrl(value, origin)
  if (!resolved) return null
  const parsed = new URL(resolved)
  return isPortablePageAssetPath(`${parsed.pathname}${parsed.search}${parsed.hash}`) ? resolved : null
}

export function portableStylesheetUrl(origin: string) {
  return new URL(PORTABLE_CONTENT_STYLESHEET_PATH, normalizePortableOrigin(origin)).href
}

function renderingBase(origin: string): PortableRenderingBase {
  return {
    contractVersion: PORTABLE_CONTENT_CONTRACT_VERSION,
    stylesheets: [portableStylesheetUrl(origin)],
    themeRevision: PORTABLE_CONTENT_THEME_REVISION
  }
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function booleanValue(value: unknown) {
  return value === true
}

function writeText(writer: PortableWriter, value: unknown) {
  writer.escaped(typeof value === 'string' ? value : '')
}

function writePortableIcon(writer: PortableWriter, value: unknown) {
  if (typeof value !== 'string' || !Object.hasOwn(portableIconSvg, value)) return false
  writer.push('<svg class="halo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">')
  writer.push(portableIconSvg[value as keyof typeof portableIconSvg])
  writer.push('</svg>')
  return true
}

function writeSafeLinkAttributes(
  writer: PortableWriter,
  href: unknown,
  target: unknown,
  origin: string
) {
  const resolved = resolvePortableLinkUrl(href, origin)
  if (!resolved) return false
  writer.attribute('href', resolved)
  if (target === '_blank') {
    writer.attribute('target', '_blank')
    writer.attribute('rel', 'noopener noreferrer')
  }
  return true
}

function writeRichTextMarks(
  writer: PortableWriter,
  text: string,
  marks: unknown,
  origin: string
) {
  const openings: string[] = []
  const closings: string[] = []
  let hasLink = false
  for (const candidate of Array.isArray(marks) ? marks : []) {
    writer.claimMark()
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue
    const mark = candidate as Record<string, any>
    const tag = typeof mark.type === 'string' ? plainMarkTags[mark.type] : undefined
    if (tag) {
      openings.push(`<${tag}>`)
      closings.unshift(`</${tag}>`)
      continue
    }
    if (mark.type !== 'link' || hasLink) continue
    const href = resolvePortableLinkUrl(mark.attrs?.href, origin)
    if (!href) continue
    const target = mark.attrs?.target === '_blank' ? '_blank' : undefined
    let opening = `<a class="halo-link" href="${escapePortableHtml(href)}"`
    if (target) opening += ' target="_blank" rel="noopener noreferrer"'
    opening += '>'
    openings.push(opening)
    closings.unshift('</a>')
    hasLink = true
  }
  for (const opening of openings) writer.push(opening)
  writer.escaped(text)
  for (const closing of closings) writer.push(closing)
}

function writeRichTextChildren(
  writer: PortableWriter,
  node: Record<string, any>,
  origin: string,
  depth: number
) {
  if (!Array.isArray(node.content)) return
  for (const child of node.content) writeRichTextNode(writer, child, origin, depth + 1)
}

function writeRichTextFallback(writer: PortableWriter) {
  writer.push('<p class="halo-content-fallback" role="status">Unsupported content</p>')
}

function writeRichTextNode(
  writer: PortableWriter,
  value: unknown,
  origin: string,
  depth: number
) {
  writer.claimNode(depth)
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    writeRichTextFallback(writer)
    return
  }
  const node = value as Record<string, any>
  const type = typeof node.type === 'string' ? node.type : ''

  if (type === 'text') {
    writeRichTextMarks(writer, typeof node.text === 'string' ? node.text : '', node.marks, origin)
    return
  }
  if (type === 'hardBreak') {
    writer.push('<br>')
    return
  }
  if (type === 'horizontalRule') {
    writer.push('<hr class="halo-divider">')
    return
  }
  if (type === 'image') {
    const src = resolvePortableAssetUrl(node.attrs?.src, origin)
    if (!src) {
      writer.push('<span class="halo-media-fallback" role="img" aria-label="Image unavailable">Image unavailable</span>')
      return
    }
    writer.push('<img class="halo-richtext-image"')
    writer.attribute('src', src)
    writer.attribute('alt', typeof node.attrs?.alt === 'string' ? node.attrs.alt.slice(0, 500) : '')
    writer.attribute('title', typeof node.attrs?.title === 'string' ? node.attrs.title.slice(0, 500) : undefined)
    const width = Number.isSafeInteger(node.attrs?.width) && node.attrs.width > 0 && node.attrs.width <= 10_000
      ? node.attrs.width
      : undefined
    const height = Number.isSafeInteger(node.attrs?.height) && node.attrs.height > 0 && node.attrs.height <= 10_000
      ? node.attrs.height
      : undefined
    writer.attribute('width', width)
    writer.attribute('height', height)
    writer.attribute('loading', 'lazy')
    writer.attribute('decoding', 'async')
    writer.push('>')
    return
  }
  if (type === 'mention') {
    writer.push('<span class="halo-mention">@')
    const label = typeof node.attrs?.label === 'string'
      ? node.attrs.label
      : typeof node.attrs?.id === 'string' ? node.attrs.id : 'mention'
    writer.escaped(label.slice(0, 200))
    writer.push('</span>')
    return
  }

  const alignment = ['heading', 'paragraph'].includes(type) && supportedAlignments.has(node.attrs?.textAlign)
    ? String(node.attrs.textAlign)
    : undefined
  if (type === 'paragraph') {
    writer.push('<p')
    writer.attribute('data-halo-align', alignment)
    writer.push('>')
    writeRichTextChildren(writer, node, origin, depth)
    writer.push('</p>')
    return
  }
  if (type === 'heading') {
    const level = [1, 2, 3, 4].includes(node.attrs?.level) ? Number(node.attrs.level) : 2
    writer.push(`<h${level}`)
    writer.attribute('data-halo-align', alignment)
    writer.push('>')
    writeRichTextChildren(writer, node, origin, depth)
    writer.push(`</h${level}>`)
    return
  }
  if (type === 'blockquote') {
    writer.push('<blockquote class="halo-blockquote">')
    writeRichTextChildren(writer, node, origin, depth)
    writer.push('</blockquote>')
    return
  }
  if (type === 'bulletList' || type === 'orderedList') {
    const tag = type === 'orderedList' ? 'ol' : 'ul'
    writer.push(`<${tag} class="halo-list"`)
    const start = type === 'orderedList' && Number.isSafeInteger(node.attrs?.start)
      && node.attrs.start > 0 && node.attrs.start <= 100_000
      ? node.attrs.start
      : undefined
    writer.attribute('start', start)
    writer.push('>')
    writeRichTextChildren(writer, node, origin, depth)
    writer.push(`</${tag}>`)
    return
  }
  if (type === 'listItem') {
    writer.push('<li>')
    writeRichTextChildren(writer, node, origin, depth)
    writer.push('</li>')
    return
  }
  if (type === 'codeBlock') {
    writer.push('<pre class="halo-code-block"><code>')
    writeRichTextChildren(writer, node, origin, depth)
    writer.push('</code></pre>')
    return
  }

  writeRichTextFallback(writer)
}

function writeMedia(
  writer: PortableWriter,
  media: Record<string, unknown>,
  origin: string
) {
  const src = resolvePortablePageAssetUrl(media.url, origin)
  if (!src) {
    if ((typeof media.url === 'string' && media.url.trim()) || typeof media.requiredAction === 'string') {
      writer.push('<div class="halo-media halo-media-fallback" role="img" aria-label="Media unavailable"><span>Media unavailable</span></div>')
    }
    return
  }
  writer.push('<figure class="halo-media"><img')
  writer.attribute('src', src)
  writer.attribute('alt', typeof media.alt === 'string' ? media.alt : '')
  writer.attribute('width', typeof media.width === 'number' ? media.width : undefined)
  writer.attribute('height', typeof media.height === 'number' ? media.height : undefined)
  writer.attribute('loading', 'lazy')
  writer.attribute('decoding', 'async')
  writer.push('></figure>')
}

function writeActions(
  writer: PortableWriter,
  links: unknown,
  origin: string
) {
  if (!Array.isArray(links) || !links.length) return
  const safeLinks = links.filter(link => link && typeof link === 'object' && !Array.isArray(link)) as Array<Record<string, unknown>>
  if (!safeLinks.some(link => resolvePortableLinkUrl(link.to, origin))) return
  writer.push('<nav class="halo-actions" aria-label="Actions">')
  for (const link of safeLinks) {
    const href = resolvePortableLinkUrl(link.to, origin)
    if (!href) continue
    writer.push('<a class="halo-action"')
    writeSafeLinkAttributes(writer, href, link.target, origin)
    writer.attribute('data-halo-variant', stringValue(link.variant) || 'solid')
    writer.attribute('data-halo-color', stringValue(link.color) || 'primary')
    writer.push('>')
    writePortableIcon(writer, link.icon)
    writeText(writer, link.label)
    writer.push('</a>')
  }
  writer.push('</nav>')
}

function writeBlockHeader(
  writer: PortableWriter,
  props: Record<string, unknown>,
  headingLevel = 2
) {
  const headline = stringValue(props.headline)
  const title = stringValue(props.title)
  const description = stringValue(props.description)
  if (!headline && !title && !description) return
  writer.push('<header class="halo-block-header">')
  if (headline) {
    writer.push('<p class="halo-eyebrow">')
    writer.escaped(headline)
    writer.push('</p>')
  }
  if (title) {
    writer.push(`<h${headingLevel} class="halo-block-title">`)
    writer.escaped(title)
    writer.push(`</h${headingLevel}>`)
  }
  if (description) {
    writer.push('<p class="halo-block-description">')
    writer.escaped(description)
    writer.push('</p>')
  }
  writer.push('</header>')
}

function writeBlockShellStart(
  writer: PortableWriter,
  element: 'article' | 'aside' | 'figure' | 'section',
  className: string,
  block: string,
  props: Record<string, unknown>
) {
  writer.push(`<${element} class="halo-block ${className}"`)
  writer.attribute('data-halo-block', block)
  const orientation = props.orientation === 'horizontal' ? 'horizontal' : 'vertical'
  writer.attribute('data-halo-orientation', orientation)
  if (booleanValue(props.reverse)) writer.attribute('data-halo-reverse', 'true')
  if (typeof props.variant === 'string') writer.attribute('data-halo-variant', props.variant)
  if (className === 'halo-card') {
    if (booleanValue(props.highlight)) {
      writer.attribute('data-halo-highlight', 'true')
      const highlightColor = stringValue(props.highlightColor)
      if (highlightColor) writer.attribute('data-halo-highlight-color', highlightColor)
    }
    if (booleanValue(props.spotlight)) {
      writer.attribute('data-halo-spotlight', 'true')
      const spotlightColor = stringValue(props.spotlightColor)
      if (spotlightColor) writer.attribute('data-halo-spotlight-color', spotlightColor)
    }
  }
  writer.push('>')
}

function writeFeatures(writer: PortableWriter, features: unknown, origin: string) {
  if (!Array.isArray(features) || !features.length) return
  writer.push('<ul class="halo-features">')
  for (const candidate of features) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue
    const feature = candidate as Record<string, unknown>
    const href = resolvePortableLinkUrl(feature.to, origin)
    writer.push('<li class="halo-feature"')
    writer.attribute('data-halo-orientation', feature.orientation === 'vertical' ? 'vertical' : 'horizontal')
    writer.push('>')
    if (href) {
      writer.push('<a class="halo-feature-link"')
      writeSafeLinkAttributes(writer, href, feature.target, origin)
      writer.push('>')
    } else {
      writer.push('<div class="halo-feature-content">')
    }
    writePortableIcon(writer, feature.icon)
    writer.push('<div class="halo-feature-body">')
    writer.push('<h3 class="halo-feature-title">')
    writeText(writer, feature.title)
    writer.push('</h3>')
    if (typeof feature.description === 'string' && feature.description) {
      writer.push('<p class="halo-feature-description">')
      writer.escaped(feature.description)
      writer.push('</p>')
    }
    writer.push('</div>')
    writer.push(href ? '</a>' : '</div>')
    writer.push('</li>')
  }
  writer.push('</ul>')
}

function writePageBlock(
  writer: PortableWriter,
  attrs: StoredPageBlockAttrs,
  origin: string,
  depth: number
) {
  writer.claimNode(depth)
  const resolved = resolvePageBlockForDelivery(attrs)
  if (resolved.status !== 'known') {
    writer.push('<section class="halo-block halo-block-fallback"')
    writer.attribute('data-halo-block-status', resolved.status)
    writer.push('><p>Content block unavailable</p></section>')
    return
  }

  const props = resolved.props as Record<string, unknown>
  const media = resolved.media as Record<string, unknown>
  if (resolved.key === 'pageHero') {
    writeBlockShellStart(writer, 'section', 'halo-hero', 'hero', props)
    writer.push('<div class="halo-block-content">')
    writeBlockHeader(writer, props, 1)
    writeActions(writer, props.links, origin)
    writer.push('</div>')
    writeMedia(writer, media, origin)
    writer.push('</section>')
    return
  }
  if (resolved.key === 'pageCard') {
    writeBlockShellStart(writer, 'article', 'halo-card', 'card', props)
    const href = resolvePortableLinkUrl(props.to, origin)
    if (href) {
      writer.push('<a class="halo-card-anchor"')
      writeSafeLinkAttributes(writer, href, props.target, origin)
      writer.push('>')
    }
    writer.push('<div class="halo-block-content">')
    writePortableIcon(writer, props.icon)
    writeBlockHeader(writer, props)
    writer.push('</div>')
    writeMedia(writer, media, origin)
    if (href) writer.push('</a>')
    writer.push('</article>')
    return
  }
  if (resolved.key === 'pageSection') {
    writeBlockShellStart(writer, 'section', 'halo-section', 'section', props)
    writer.push('<div class="halo-block-content">')
    writePortableIcon(writer, props.icon)
    writeBlockHeader(writer, props)
    writeFeatures(writer, props.features, origin)
    writeActions(writer, props.links, origin)
    writer.push('</div>')
    writeMedia(writer, media, origin)
    writer.push('</section>')
    return
  }
  if (resolved.key === 'pageTestimonial') {
    writeBlockShellStart(writer, 'figure', 'halo-testimonial', 'testimonial', props)
    writeMedia(writer, media, origin)
    writer.push('<div class="halo-block-content"><blockquote class="halo-testimonial-quote"><p>')
    writeText(writer, props.quote)
    writer.push('</p></blockquote>')
    const author = stringValue(props.author)
    const role = stringValue(props.role)
    const company = stringValue(props.company)
    if (author || role || company) {
      writer.push('<figcaption class="halo-testimonial-attribution">')
      if (author) writer.escaped(author)
      if (role || company) {
        writer.push('<span>')
        writer.escaped([role, company].filter(Boolean).join(', '))
        writer.push('</span>')
      }
      writer.push('</figcaption>')
    }
    writer.push('</div></figure>')
    return
  }
  if (resolved.key === 'pageLogos') {
    writeBlockShellStart(writer, 'section', 'halo-logos', 'logos', props)
    writeBlockHeader(writer, props)
    writer.push('<ul class="halo-logo-list">')
    for (const candidate of Array.isArray(props.items) ? props.items : []) {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue
      const item = candidate as Record<string, unknown>
      const src = resolvePortablePageAssetUrl(item.src, origin)
      writer.push('<li class="halo-logo-item">')
      if (src) {
        writer.push('<img class="halo-logo-image"')
        writer.attribute('src', src)
        writer.attribute('alt', stringValue(item.alt) || stringValue(item.name))
        writer.attribute('loading', 'lazy')
        writer.attribute('decoding', 'async')
        writer.push('>')
      } else {
        writer.push('<span class="halo-logo-name"')
        if (typeof item.src === 'string' && item.src) writer.attribute('data-halo-asset-status', 'unavailable')
        writer.push('>')
        writeText(writer, item.name)
        writer.push('</span>')
      }
      writer.push('</li>')
    }
    writer.push('</ul></section>')
    return
  }
  if (resolved.key === 'pageFAQ') {
    writeBlockShellStart(writer, 'section', 'halo-faq', 'faq', props)
    writeBlockHeader(writer, props)
    writer.push('<div class="halo-faq-list">')
    for (const candidate of Array.isArray(props.items) ? props.items : []) {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue
      const item = candidate as Record<string, unknown>
      writer.push('<details class="halo-faq-item"><summary class="halo-faq-question">')
      writeText(writer, item.question)
      writer.push('</summary><div class="halo-faq-answer"><p>')
      writeText(writer, item.answer)
      writer.push('</p></div></details>')
    }
    writer.push('</div></section>')
    return
  }

  writeBlockShellStart(writer, 'aside', 'halo-cta', 'cta', props)
  writer.push('<div class="halo-block-content">')
  writeBlockHeader(writer, props)
  writeActions(writer, props.links, origin)
  writer.push('</div>')
  writeMedia(writer, media, origin)
  writer.push('</aside>')
}

function writeRichTextDocumentContent(
  writer: PortableWriter,
  value: unknown,
  origin: string,
  options: { allowPageBlocks: boolean }
) {
  if (typeof value === 'string') {
    writer.push('<p>')
    writer.escaped(value)
    writer.push('</p>')
    return
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    writeRichTextFallback(writer)
    return
  }
  const document = value as Record<string, any>
  if (document.type !== 'doc' || !Array.isArray(document.content)) {
    writeRichTextFallback(writer)
    return
  }
  for (const candidate of document.content) {
    if (options.allowPageBlocks && candidate && typeof candidate === 'object' && !Array.isArray(candidate)
      && (candidate as Record<string, unknown>).type === 'pageBlock') {
      const attrs = (candidate as Record<string, any>).attrs
      writePageBlock(
        writer,
        attrs && typeof attrs === 'object' && !Array.isArray(attrs) ? attrs : {},
        origin,
        1
      )
    } else {
      writeRichTextNode(writer, candidate, origin, 1)
    }
  }
}

function renderWithFallback(
  options: PortableRenderOptions,
  root: { className: string, contentKind: string },
  render: (writer: PortableWriter, origin: string) => void,
  sharedBudget?: PortableBudget
) {
  const origin = normalizePortableOrigin(options.origin)
  const limits = renderingLimits(options.limits)
  const rootStart = `<article class="halo-content ${root.className}" data-halo-contract-version="1" data-halo-content="${root.contentKind}" data-halo-color-mode="default">`
  const rootEnd = '</article>'
  const fallback = `${rootStart}<p class="halo-content-fallback" role="status">Content exceeds portable rendering limits</p>${rootEnd}`
  if (fallback.length > limits.maxOutputLength) return ''
  const budget = sharedBudget ?? new PortableBudget(limits)
  const checkpoint = budget.checkpoint()
  try {
    const writer = new PortableWriter(budget)
    writer.push(rootStart)
    render(writer, origin)
    writer.push(rootEnd)
    return writer.toString()
  } catch (error) {
    if (!(error instanceof PortableRenderBudgetError)) throw error
    budget.recover(checkpoint)
    if (fallback.length > budget.remainingOutput()) return ''
    budget.charge(fallback.length)
    return fallback
  }
}

export function renderPortableRichText(value: unknown, options: PortableRenderOptions) {
  return renderWithFallback(options, { className: 'halo-richtext', contentKind: 'richtext' }, (writer, origin) => {
    writeRichTextDocumentContent(writer, value, origin, { allowPageBlocks: false })
  })
}

export function renderPortablePageDocument(value: unknown, options: PortableRenderOptions) {
  return renderWithFallback(options, { className: 'halo-page', contentKind: 'page' }, (writer, origin) => {
    writeRichTextDocumentContent(writer, value, origin, { allowPageBlocks: true })
  })
}

export function createPortablePageRendering(
  document: unknown,
  options: PortableRenderOptions
): PortableDocumentRendering {
  return {
    ...renderingBase(options.origin),
    html: renderPortablePageDocument(document, options)
  }
}

export function createPortableRichTextRendering(
  document: unknown,
  options: PortableRenderOptions
): PortableDocumentRendering {
  return {
    ...renderingBase(options.origin),
    html: renderPortableRichText(document, options)
  }
}

export function createPortableStructuredContentRendering(
  content: Record<string, unknown>,
  schemaFields: PortableSchemaField[],
  options: PortableRenderOptions
): PortableStructuredContentRendering {
  const fields: Record<string, PortableRichTextFieldRendering> = Object.create(null)
  const limits = renderingLimits(options.limits)
  const budget = new PortableBudget(limits)
  const scanLimit = Math.min(schemaFields.length, limits.maxSchemaFields)
  let truncated = schemaFields.length > scanLimit
  for (let index = 0; index < scanLimit; index += 1) {
    const field = schemaFields[index]!
    if (field.kind !== 'richtext') continue
    try {
      budget.claimField(field.fieldId, field.key)
    } catch (error) {
      if (!(error instanceof PortableRenderBudgetError)) throw error
      truncated = true
      break
    }
    const html = renderWithFallback(
      options,
      { className: 'halo-richtext', contentKind: 'richtext' },
      (writer, origin) => writeRichTextDocumentContent(writer, content[field.key], origin, { allowPageBlocks: false }),
      budget
    )
    fields[field.key] = {
      fieldId: field.fieldId,
      fieldKey: field.key,
      html
    }
    if (budget.exceeded) {
      truncated = true
      break
    }
  }
  return {
    ...renderingBase(options.origin),
    fields,
    ...(truncated ? { truncated: true as const } : {})
  }
}

export function createPortableStandaloneDocument(
  rendering: PortableDocumentRendering,
  options: { title?: string, colorMode?: 'default' | 'light' | 'dark' } = {}
) {
  const title = escapePortableHtml(options.title || 'HaloPress portable content')
  const colorMode = options.colorMode ?? 'default'
  const stylesheets = rendering.stylesheets
    .map(href => `<link rel="stylesheet" href="${escapePortableHtml(href)}">`)
    .join('')
  const html = rendering.html.replace('data-halo-color-mode="default"', `data-halo-color-mode="${colorMode}"`)
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>${stylesheets}</head><body>${html}</body></html>`
}
