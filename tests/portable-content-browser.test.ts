// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest'

import {
  createPortablePageRendering,
  createPortableStandaloneDocument,
  PORTABLE_CONTENT_STYLESHEET_PATH
} from '../shared/portable-content'
import { portableContentFixture } from './fixtures/portable-content'

describe('portable standalone browser document', () => {
  it('hydrates a separate-origin DOM using only semantic output and the versioned stylesheet', () => {
    const pressOrigin = 'https://press.example.com'
    const rendering = createPortablePageRendering(portableContentFixture, { origin: pressOrigin })
    const standalone = createPortableStandaloneDocument(rendering, { title: 'Portable browser fixture' })
    const template = document.createElement('template')
    template.innerHTML = rendering.html
    const parsed = template.content

    expect(standalone).toContain('<title>Portable browser fixture</title>')
    expect(parsed.querySelectorAll('script')).toHaveLength(0)
    expect(parsed.querySelectorAll('.halo-block')).toHaveLength(7)
    expect(parsed.querySelectorAll('.halo-icon').length).toBeGreaterThanOrEqual(6)
    expect(parsed.querySelectorAll('.halo-feature[data-halo-orientation="horizontal"]').length).toBeGreaterThanOrEqual(1)
    expect(parsed.querySelector('.halo-content')?.getAttribute('data-halo-contract-version')).toBe('1')

    const stylesheet = `${pressOrigin}${PORTABLE_CONTENT_STYLESHEET_PATH}`
    expect(standalone).toContain(`<link rel="stylesheet" href="${stylesheet}">`)
    expect(new URL(stylesheet).origin).not.toBe('http://localhost:3000')
    expect(parsed.querySelectorAll('.halo-content [style], .halo-content [id], .halo-content [onclick]')).toHaveLength(0)
    expect(template.innerHTML).not.toMatch(/@nuxt\/ui|__nuxt|SiteWorkspaceShell|tailwind/i)
  })
})
