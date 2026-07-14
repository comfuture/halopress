import { badRequest } from '../utils/http'
import { validatePageDocumentBlocks } from '~~/shared/page-blocks'

export const emptyPageDocument = { type: 'doc', content: [{ type: 'paragraph' }] }

export function normalizePageContent(
  value: unknown,
  options: { mode?: 'draft' | 'publish' } = {}
): Record<string, unknown> {
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

  const issues = validatePageDocumentBlocks(document, {
    allowUnknown: options.mode !== 'publish'
  })
  if (issues.length) throw badRequest(issues[0]!.message)

  return document
}
