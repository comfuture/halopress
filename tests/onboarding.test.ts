import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { isBootstrapSchema } from '../server/utils/bootstrap'
import { hasCustomDomain, hasImageTransformations } from '../server/utils/onboarding'

const projectRoot = join(import.meta.dirname, '..')

describe('settings onboarding', () => {
  it('distinguishes custom domains from local and Cloudflare platform hosts', () => {
    expect(hasCustomDomain('cms.example.com')).toBe(true)
    expect(hasCustomDomain('CMS.EXAMPLE.COM.')).toBe(true)
    expect(hasCustomDomain('site.account.workers.dev')).toBe(false)
    expect(hasCustomDomain('site.pages.dev')).toBe(false)
    expect(hasCustomDomain('localhost')).toBe(false)
    expect(hasCustomDomain('127.0.0.1')).toBe(false)
  })

  it('only excludes the exact starter schema from user onboarding progress', () => {
    expect(isBootstrapSchema({ schemaKey: 'article', version: 1, note: 'bootstrap' })).toBe(true)
    expect(isBootstrapSchema({ schemaKey: 'article', version: 2, note: null })).toBe(false)
    expect(isBootstrapSchema({ schemaKey: 'product', version: 1, note: 'bootstrap' })).toBe(false)
  })

  it('only probes Image Transformations in the Cloudflare runtime', async () => {
    const fetcher = vi.fn()
    const event = {
      context: {},
      path: '/',
      node: { req: { url: '/', headers: { host: 'localhost:3000' } } }
    }

    await expect(hasImageTransformations(event as any, fetcher as any)).resolves.toBe(false)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('detects a successful live Cloudflare image response', async () => {
    const fetcher = vi.fn(async () => new Response(new Uint8Array([1]), {
      status: 200,
      headers: {
        'content-type': 'image/webp',
        'cf-resized': 'orig-size=128'
      }
    }))
    const event = {
      context: { cloudflare: {} },
      path: '/',
      node: { req: { url: '/', headers: { host: 'cms.example.com' } } }
    }

    await expect(hasImageTransformations(event as any, fetcher as any)).resolves.toBe(true)
    expect(fetcher).toHaveBeenCalledWith(
      new URL('http://cms.example.com/cdn-cgi/image/w=32,h=32,fit=cover,f=webp/branding/halopress-mark-256.png'),
      expect.objectContaining({ headers: { accept: 'image/webp,image/*' } })
    )
  })

  it('rejects raw and failed image responses as transformation evidence', async () => {
    const rawResponse = vi.fn(async () => new Response(new Uint8Array([1]), {
      status: 200,
      headers: { 'content-type': 'image/png' }
    }))
    const failedResponse = vi.fn(async () => new Response(new Uint8Array([1]), {
      status: 200,
      headers: {
        'content-type': 'image/webp',
        'cf-resized': 'err=9422'
      }
    }))
    const event = {
      context: { cloudflare: {} },
      path: '/',
      node: { req: { url: '/', headers: { host: 'cms.example.com' } } }
    }

    await expect(hasImageTransformations(event as any, rawResponse as any)).resolves.toBe(false)
    await expect(hasImageTransformations(event as any, failedResponse as any)).resolves.toBe(false)
  })

  it('keeps the five recommended setup guides on the default Settings page', async () => {
    const page = await readFile(join(projectRoot, 'app/pages/_desk/settings/index.vue'), 'utf8')
    for (const title of [
      'Create a schema',
      'Publish new content',
      'Set up a custom domain',
      'Enable Image Transformations',
      'Configure Google OAuth'
    ]) {
      expect(page).toContain(title)
    }
    expect(page).toContain('<UProgress')
    expect(page).toContain('item.complete ? \'i-lucide-circle-check-big\' : \'i-lucide-circle\'')

    const statusApi = await readFile(join(projectRoot, 'server/api/settings/onboarding.get.ts'), 'utf8')
    expect(statusApi).toContain('BOOTSTRAP_CONTENT_ID')
    expect(statusApi).toContain('isBootstrapSchema')
  })
})
