import { generateHTML } from '@tiptap/html'
import type { JSONContent } from '@tiptap/core'

import { isSafePageUrl, type StoredPageBlockAttrs } from '~~/shared/page-blocks'
import { createPageProfile } from '../profiles'

export type PageDocumentSegment =
  | { kind: 'html', key: string, html: string }
  | { kind: 'block', key: string, attrs: StoredPageBlockAttrs }
  | { kind: 'fallback', key: string, message: string }

const containerNodes = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'bulletList',
  'orderedList',
  'listItem',
  'codeBlock'
])
const leafNodes = new Set(['horizontalRule', 'hardBreak'])
const plainMarks = new Set(['bold', 'italic', 'strike', 'code', 'underline'])
const alignments = new Set(['left', 'center', 'right', 'justify'])

function fallbackNode(type: string): JSONContent {
  return {
    type: 'paragraph',
    content: [{ type: 'text', text: `[Unsupported content: ${type || 'unknown'}]` }]
  }
}

function sanitizeMarks(value: unknown): JSONContent['marks'] {
  if (!Array.isArray(value)) return undefined
  const marks: NonNullable<JSONContent['marks']> = []
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') continue
    const mark = candidate as Record<string, any>
    if (plainMarks.has(mark.type)) {
      marks.push({ type: mark.type })
      continue
    }
    if (mark.type !== 'link') continue
    const href = typeof mark.attrs?.href === 'string' ? mark.attrs.href : ''
    if (!href || !isSafePageUrl(href)) continue
    const target = mark.attrs?.target === '_blank' ? '_blank' : '_self'
    marks.push({ type: 'link', attrs: { href, target } })
  }
  return marks.length ? marks : undefined
}

function sanitizeNode(value: unknown): JSONContent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallbackNode('unknown')
  const node = value as Record<string, any>
  const type = typeof node.type === 'string' ? node.type : ''

  if (type === 'text') {
    return {
      type: 'text',
      text: typeof node.text === 'string' ? node.text : '',
      marks: sanitizeMarks(node.marks)
    }
  }

  if (type === 'image') {
    const src = typeof node.attrs?.src === 'string' ? node.attrs.src : ''
    if (!src || !isSafePageUrl(src)) return fallbackNode('image')
    return {
      type: 'image',
      attrs: {
        src,
        alt: typeof node.attrs?.alt === 'string' ? node.attrs.alt.slice(0, 500) : '',
        title: typeof node.attrs?.title === 'string' ? node.attrs.title.slice(0, 500) : null,
        width: Number.isInteger(node.attrs?.width) && node.attrs.width > 0 ? node.attrs.width : null,
        height: Number.isInteger(node.attrs?.height) && node.attrs.height > 0 ? node.attrs.height : null
      }
    }
  }

  if (type === 'mention') {
    return {
      type: 'mention',
      attrs: {
        id: typeof node.attrs?.id === 'string' ? node.attrs.id.slice(0, 200) : '',
        label: typeof node.attrs?.label === 'string' ? node.attrs.label.slice(0, 200) : null
      }
    }
  }

  if (leafNodes.has(type)) return { type }
  if (!containerNodes.has(type)) return fallbackNode(type)

  const attrs: Record<string, unknown> = {}
  if (type === 'heading') {
    attrs.level = [1, 2, 3, 4].includes(node.attrs?.level) ? node.attrs.level : 2
  }
  if (['heading', 'paragraph'].includes(type) && alignments.has(node.attrs?.textAlign)) {
    attrs.textAlign = node.attrs.textAlign
  }
  return {
    type,
    ...(Object.keys(attrs).length ? { attrs } : {}),
    content: Array.isArray(node.content) ? node.content.map(sanitizeNode) : undefined
  }
}

export function sanitizePageDocument(value: unknown): JSONContent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { type: 'doc', content: [fallbackNode('document')] }
  }
  const document = value as Record<string, any>
  if (document.type !== 'doc' || !Array.isArray(document.content)) {
    return { type: 'doc', content: [fallbackNode('document')] }
  }
  return { type: 'doc', content: document.content.map(sanitizeNode) }
}

export function buildPageDocumentSegments(value: unknown): PageDocumentSegment[] {
  const content = value && typeof value === 'object' && !Array.isArray(value)
    && (value as Record<string, unknown>).type === 'doc'
    && Array.isArray((value as Record<string, unknown>).content)
    ? (value as Record<string, any>).content as unknown[]
    : []
  const segments: PageDocumentSegment[] = []
  let ordinary: unknown[] = []
  let segmentIndex = 0

  const flushOrdinary = () => {
    if (!ordinary.length) return
    const key = `html-${segmentIndex++}`
    try {
      const document = sanitizePageDocument({ type: 'doc', content: ordinary })
      const html = generateHTML(document, createPageProfile().readOnlyExtensions)
      segments.push({ kind: 'html', key, html })
    } catch {
      segments.push({ kind: 'fallback', key, message: 'Unable to render document content' })
    }
    ordinary = []
  }

  for (const candidate of content) {
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)
      && (candidate as Record<string, unknown>).type === 'pageBlock') {
      flushOrdinary()
      const attrs = (candidate as Record<string, any>).attrs
      segments.push({
        kind: 'block',
        key: `block-${segmentIndex++}`,
        attrs: attrs && typeof attrs === 'object' && !Array.isArray(attrs) ? attrs : {}
      })
    } else {
      ordinary.push(candidate)
    }
  }
  flushOrdinary()
  return segments
}
