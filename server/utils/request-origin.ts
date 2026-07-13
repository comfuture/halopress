import { getRequestURL, type H3Event } from 'h3'

export function getTrustedRequestOrigin(event: H3Event) {
  try {
    return getRequestURL(event).origin
  } catch {
    return undefined
  }
}
