import { describe, expect, it, vi } from 'vitest'

import { queueWidgetCacheInvalidation } from '../server/utils/widget-cache'

describe('widget cache background work', () => {
  it('calls the Cloudflare waitUntil method with its owning context', async () => {
    let backgroundTask: Promise<unknown> | undefined
    const workerContext = {
      waitUntil: vi.fn(function (this: unknown, task: Promise<unknown>) {
        expect(this).toBe(workerContext)
        backgroundTask = task
      })
    }
    const event = {
      context: {
        cloudflare: {
          context: workerContext,
          env: {}
        }
      },
      node: {
        req: {
          headers: { host: 'acme-news.example.com' }
        }
      }
    }

    expect(() => queueWidgetCacheInvalidation(event as any, 'schema:article')).not.toThrow()
    expect(workerContext.waitUntil).toHaveBeenCalledOnce()
    await expect(backgroundTask).resolves.toBeDefined()
  })
})
