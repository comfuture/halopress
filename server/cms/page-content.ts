import { badRequest } from '../utils/http'

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
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>
  }
  throw badRequest('Invalid content JSON')
}
