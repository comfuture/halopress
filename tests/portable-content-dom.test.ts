// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest'

import {
  createPortablePageRendering,
  createPortableStandaloneDocument,
  createPortableStructuredContentRendering,
  PORTABLE_CONTENT_STYLESHEET_PATH
} from '../shared/portable-content'
import { portableContentFixture } from './fixtures/portable-content'

describe('portable standalone DOM contract', () => {
  it('parses separate-origin semantic output in happy-dom with the versioned stylesheet', () => {
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
    expect(parsed.querySelectorAll('.halo-content [style], .halo-content [onclick]')).toHaveLength(0)
    expect([...parsed.querySelectorAll('.halo-content [id]')].map(element => element.id))
      .toEqual(rendering.outline.map(entry => entry.id))
    expect(template.innerHTML).not.toMatch(/@nuxt\/ui|__nuxt|SiteWorkspaceShell|tailwind/i)
  })

  it('keeps every projected outline entry linked to a code-owned SSR heading anchor', () => {
    const document = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2, id: 'hostile-stored-id', class: 'not-portable' },
          content: [{ type: 'text', text: 'Duplicate' }]
        },
        {
          type: 'heading',
          attrs: { level: 2, id: 'another-hostile-id' },
          content: [{ type: 'text', text: 'Duplicate' }]
        }
      ]
    }
    const rendering = createPortablePageRendering(document, { origin: 'https://press.example.com' })
    const template = window.document.createElement('template')
    template.innerHTML = rendering.html

    expect(rendering.outline.map(entry => entry.id)).toEqual([
      'halo-heading-duplicate',
      'halo-heading-duplicate-2'
    ])
    for (const entry of rendering.outline) {
      const heading = template.content.querySelector(`#${entry.id}`)
      expect(heading?.textContent).toBe(entry.text)
      expect(Number(heading?.tagName.slice(1))).toBe(entry.level)
    }
    expect(template.content.querySelectorAll('#hostile-stored-id, #another-hostile-id')).toHaveLength(0)
    expect(template.content.querySelectorAll('[class]:not([class^="halo-"])')).toHaveLength(0)
  })

  it('keeps multi-field portable subtrees independent from application classes', () => {
    const richText = {
      type: 'doc',
      content: [{
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: 'Shared title' }]
      }]
    }
    const rendering = createPortableStructuredContentRendering({
      introduction: richText,
      details: structuredClone(richText)
    }, [
      { fieldId: 'field-introduction', key: 'introduction', kind: 'richtext' },
      { fieldId: 'field-details', key: 'details', kind: 'richtext' }
    ], { origin: 'https://press.example.com', headingIdPrefix: 'content-record' })
    const template = window.document.createElement('template')
    template.innerHTML = Object.values(rendering.fields).map(field => field.html).join('')
    const ids = [...template.content.querySelectorAll('h1[id], h2[id], h3[id], h4[id]')]
      .map(heading => heading.id)

    expect(ids).toEqual(rendering.outline.map(entry => entry.id))
    expect(new Set(ids).size).toBe(ids.length)
    expect([...template.content.querySelectorAll('[class]')].every((element) => {
      return [...element.classList].every(className => className.startsWith('halo-'))
    })).toBe(true)
    expect(template.innerHTML).not.toMatch(/(?:class|style)="(?:u-|grid|flex|container|prose|tailwind)/i)
  })
})
