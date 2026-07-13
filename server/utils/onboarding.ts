import type { H3Event } from 'h3'
import { getRequestURL } from 'h3'

const PLATFORM_HOST_SUFFIXES = ['.workers.dev', '.pages.dev']

export function hasCustomDomain(hostname: string) {
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, '')
  if (!normalized || normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1') return false
  return !PLATFORM_HOST_SUFFIXES.some(suffix => normalized.endsWith(suffix))
}

export async function hasImageTransformations(
  event: H3Event,
  fetcher: typeof fetch = globalThis.fetch
) {
  if (!(event as any).context?.cloudflare) return false

  const probeUrl = new URL(
    '/cdn-cgi/image/w=32,h=32,fit=cover,f=webp/branding/halopress-mark-256.png',
    getRequestURL(event).origin
  )
  try {
    const response = await fetcher(probeUrl, {
      headers: { accept: 'image/webp,image/*' },
      signal: AbortSignal.timeout(4000)
    })
    const contentType = response.headers.get('content-type') || ''
    const cfResized = response.headers.get('cf-resized') || ''
    const bytes = await response.arrayBuffer()
    return response.ok
      && contentType.startsWith('image/webp')
      && Boolean(cfResized)
      && !/\berr=/.test(cfResized)
      && bytes.byteLength > 0
  } catch {
    return false
  }
}
