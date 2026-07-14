import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')

describe('public presentation UI contracts', () => {
  it('does not expose diagnostic pre output and shares the renderer with preview', async () => {
    const [detail, preview] = await Promise.all([
      readFile(resolve(root, 'app/pages/[schema]/[id].vue'), 'utf8'),
      readFile(resolve(root, 'app/pages/_preview/content/[schemaKey]/[id].vue'), 'utf8')
    ])
    expect(detail).toContain('PublicContentDetailRenderer')
    expect(preview).toContain('PublicContentDetailRenderer')
    expect(detail).not.toContain('<pre')
    expect(preview).not.toContain('<pre')
  })

  it('renders zero, one, and many galleries with keyboard, live status, SSR figures, and reduced motion', async () => {
    const gallery = await readFile(resolve(root, 'app/components/public/AssetGallery.vue'), 'utf8')
    expect(gallery).toContain('items.length === 0')
    expect(gallery).toContain('items.length === 1')
    expect(gallery).toContain('<figure')
    expect(gallery).toContain('event.key === \'ArrowLeft\'')
    expect(gallery).toContain('event.key === \'ArrowRight\'')
    expect(gallery).toContain('aria-live="polite"')
    expect(gallery).toContain('prefers-reduced-motion: reduce')
    expect(gallery).not.toContain('autoplay')
  })

  it('provides accessible ordered authoring and per-item metadata', async () => {
    const picker = await readFile(resolve(root, 'app/components/cms/AssetListPicker.vue'), 'utf8')
    expect(picker).toContain('<ol')
    expect(picker).toContain('Move asset ${index + 1} up')
    expect(picker).toContain('Move asset ${index + 1} down')
    expect(picker).toContain('Remove asset ${index + 1}')
    expect(picker).toContain('Alt text for asset')
    expect(picker).toContain('Caption for asset')
  })
})
