import { badRequest } from '../utils/http'
import { resolvePageBlock } from '~~/shared/page-blocks'

export const emptyPageDocument = { type: 'doc', content: [{ type: 'paragraph' }] }

export function normalizePageContent(value: unknown): Record<string, unknown> {
  if (value == null) return structuredClone(emptyPageDocument)
  let parsed = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch {
      throw badRequest('Invalid content JSON')
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw badRequest('Invalid content JSON')
  const document = parsed as Record<string, unknown>
  if (document.type !== 'doc') throw badRequest('Page content must be a Tiptap document')
  if (document.content !== undefined && !Array.isArray(document.content)) throw badRequest('Invalid page content')

  const visit = (candidate: unknown) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return
    const node = candidate as Record<string, any>
    if (node.type === 'pageBlock') resolvePageBlock(node.attrs ?? {})
    if (Array.isArray(node.content)) node.content.forEach(visit)
  }
  ;(document.content ?? []).forEach(visit)
  return document
}
