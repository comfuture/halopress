import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import {
  EXPECTED_ONBOARDING_ITEM_COUNT,
  getOnboardingItems,
  hasCompletedOnboarding,
  type OnboardingStatus
} from '../app/utils/onboarding'
import { isBootstrapSchema } from '../server/utils/bootstrap'
import { hasCustomDomain, hasImageTransformations } from '../server/utils/onboarding'

const projectRoot = join(import.meta.dirname, '..')

function onboardingStatus(complete: boolean): OnboardingStatus {
  return {
    schemas: { complete, firstSchemaKey: complete ? 'article' : null },
    content: { complete },
    customDomain: { complete },
    imageTransformations: { complete },
    googleOAuth: { complete }
  }
}

describe('dashboard onboarding', () => {
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

  it('only completes onboarding when all five items are complete', () => {
    const completeItems = getOnboardingItems(onboardingStatus(true))
    expect(completeItems).toHaveLength(EXPECTED_ONBOARDING_ITEM_COUNT)
    expect(hasCompletedOnboarding(completeItems)).toBe(true)

    expect(hasCompletedOnboarding(getOnboardingItems(onboardingStatus(false)))).toBe(false)
    expect(hasCompletedOnboarding(completeItems.slice(0, 4))).toBe(false)
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
    const error = new Response('<html>Error</html>', {
      status: 500,
      headers: { 'content-type': 'text/html' }
    })
    const raw = new Response(new Uint8Array([1]), {
      status: 200,
      headers: { 'content-type': 'image/png' }
    })
    const failed = new Response(new Uint8Array([1]), {
      status: 200,
      headers: {
        'content-type': 'image/webp',
        'cf-resized': 'err=9422'
      }
    })
    const errorBodyReader = vi.spyOn(error, 'arrayBuffer')
    const rawBodyReader = vi.spyOn(raw, 'arrayBuffer')
    const failedBodyReader = vi.spyOn(failed, 'arrayBuffer')
    const errorBodyCancel = vi.spyOn(error.body!, 'cancel')
    const rawBodyCancel = vi.spyOn(raw.body!, 'cancel')
    const failedBodyCancel = vi.spyOn(failed.body!, 'cancel')
    const event = {
      context: { cloudflare: {} },
      path: '/',
      node: { req: { url: '/', headers: { host: 'cms.example.com' } } }
    }

    await expect(hasImageTransformations(event as any, vi.fn(async () => error) as any)).resolves.toBe(false)
    await expect(hasImageTransformations(event as any, vi.fn(async () => raw) as any)).resolves.toBe(false)
    await expect(hasImageTransformations(event as any, vi.fn(async () => failed) as any)).resolves.toBe(false)
    expect(errorBodyReader).not.toHaveBeenCalled()
    expect(rawBodyReader).not.toHaveBeenCalled()
    expect(failedBodyReader).not.toHaveBeenCalled()
    expect(errorBodyCancel).toHaveBeenCalledOnce()
    expect(rawBodyCancel).toHaveBeenCalledOnce()
    expect(failedBodyCancel).toHaveBeenCalledOnce()
  })

  it('keeps the five recommended setup guides in a dismissible dashboard widget', async () => {
    const widget = await readFile(join(projectRoot, 'app/components/OnboardingWidget.vue'), 'utf8')
    const itemDefinitions = await readFile(join(projectRoot, 'app/utils/onboarding.ts'), 'utf8')
    for (const title of [
      'Create a schema',
      'Publish new content',
      'Set up a custom domain',
      'Enable Image Transformations',
      'Configure Google OAuth'
    ]) {
      expect(itemDefinitions).toContain(title)
    }
    expect(widget).toContain('<UProgress')
    expect(widget).toContain('item.complete ? \'i-lucide-circle-check-big\' : \'i-lucide-circle\'')
    expect(widget).toContain('hasCompletedOnboarding(items.value)')
    expect(widget).toContain('useCookie<boolean>(\'halopress_onboarding_dismissed_v1\'')
    expect(widget).toContain('server: false')
    expect(widget).toContain('label="Dismiss for now"')
    expect(widget).toContain('aria-label="Onboarding progress"')
    expect(widget).toContain('item.complete ? \'Complete\' : \'Not complete\'')
    expect(widget).toContain('opens in a new tab')

    const dashboard = await readFile(join(projectRoot, 'app/pages/_desk/index.vue'), 'utf8')
    expect(dashboard).toContain('<OnboardingWidget')

    const settings = await readFile(join(projectRoot, 'app/pages/_desk/settings/index.vue'), 'utf8')
    expect(settings).toContain('await navigateTo(\'/_desk\', { replace: true })')

    const statusApi = await readFile(join(projectRoot, 'server/api/settings/onboarding.get.ts'), 'utf8')
    expect(statusApi).toContain('BOOTSTRAP_CONTENT_ID')
    expect(statusApi).toContain('isBootstrapSchema')
  })
})
