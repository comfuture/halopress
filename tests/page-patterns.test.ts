import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { pageBlockKeys } from '../shared/page-blocks'
import {
  buildPageDocumentFromPattern,
  clonePagePatternContent,
  pagePatternDefinitions,
  pagePatternKeys,
  validatePagePatternDefinition
} from '../shared/page-patterns'
import { pagePatternViewports, pagePatternVisualFixtures } from './fixtures/page-patterns'

const projectRoot = resolve(import.meta.dirname, '..')

describe('page pattern registry', () => {
  it('keeps versioned patterns separate from atomic block definitions', () => {
    expect(pagePatternDefinitions.map(pattern => pattern.key)).toEqual(pagePatternKeys)
    expect(new Set(pagePatternKeys).size).toBe(pagePatternKeys.length)
    expect(pagePatternKeys.some(key => pageBlockKeys.includes(key as any))).toBe(false)

    for (const pattern of pagePatternDefinitions) {
      expect(pattern.version).toBe(1)
      expect(pattern.insertion).toBe('pattern')
      expect(pattern.compatibility).toMatchObject({
        editor: 'page',
        patternContract: 1,
        blockRegistry: 1
      })
      expect(pattern.compatibility.requiredBlocks.length).toBeGreaterThan(0)
      expect(validatePagePatternDefinition(pattern)).toEqual([])
    }
  })

  it('ships the reviewed starter set and deep-clones every insertion', () => {
    expect(pagePatternKeys).toEqual([
      'centered-hero',
      'split-hero',
      'feature-grid',
      'media-content',
      'testimonial-social-proof',
      'faq',
      'closing-cta',
      'starter-page'
    ])

    const first = clonePagePatternContent('starter-page')
    const second = clonePagePatternContent('starter-page')
    expect(first).toEqual(second)
    expect(first).not.toBe(second)
    expect(first[0]).not.toBe(second[0])
    first[0]!.attrs.props = { title: 'Changed after insertion' }
    expect(second[0]!.attrs.props).not.toEqual(first[0]!.attrs.props)
    expect(buildPageDocumentFromPattern('starter-page').content).not.toEqual(first)
  })

  it('contains only portable allowlisted data and intentional author placeholders', () => {
    const serialized = JSON.stringify(pagePatternDefinitions)
    expect(serialized).not.toMatch(/https?:\/\//)
    expect(serialized).not.toMatch(/"(?:class|ui|onClick|is)":/)
    expect(serialized).toContain('requiredAction')
    expect(serialized).toContain('[Add')

    const splitHero = pagePatternDefinitions.find(pattern => pattern.key === 'split-hero')!
    expect(splitHero.content.content[0]!.attrs.media).toMatchObject({
      url: '',
      alt: '',
      requiredAction: expect.stringContaining('hero image')
    })

    const unsafe = structuredClone(splitHero)
    ;(unsafe.content.content[0]!.attrs as any).renderer = 'ArbitraryComponent'
    expect(validatePagePatternDefinition(unsafe)).toContain('Pattern node 1 has invalid curated properties.')
  })
})

describe('page pattern visual fixtures', () => {
  it('provides deterministic desktop and mobile regression targets for every pattern', () => {
    expect(pagePatternViewports).toEqual({
      desktop: { width: 1280, height: 900, colorMode: 'light' },
      mobile: { width: 390, height: 844, colorMode: 'dark' }
    })

    for (const pattern of pagePatternDefinitions) {
      const fixtures = pagePatternVisualFixtures.filter(fixture => fixture.patternKey === pattern.key)
      expect(fixtures.map(fixture => fixture.viewport).sort()).toEqual(['desktop', 'mobile'])
      for (const fixture of fixtures) {
        expect(fixture.patternVersion).toBe(pattern.version)
        expect(fixture.document).toEqual(buildPageDocumentFromPattern(pattern.key as any))
        expect(fixture.selector).toContain(`${pattern.key}-v${pattern.version}`)
      }
    }
  })

  it('uses responsive Nuxt UI primitives, semantic colors, and keyboard-accessible FAQ controls', async () => {
    const [section, faq, logos, media, fixtureHarness] = await Promise.all([
      readFile(resolve(projectRoot, 'app/editor/page/PageBlockView.vue'), 'utf8'),
      readFile(resolve(projectRoot, 'app/components/page-blocks/PageBlockFAQ.vue'), 'utf8'),
      readFile(resolve(projectRoot, 'app/components/page-blocks/PageBlockLogos.vue'), 'utf8'),
      readFile(resolve(projectRoot, 'app/components/page-blocks/PageBlockMedia.vue'), 'utf8'),
      readFile(resolve(projectRoot, 'tests/fixtures/PagePatternVisualFixture.vue'), 'utf8')
    ])
    expect(section).toContain('<PageBlockFAQ')
    expect(section).toContain('<PageBlockMedia')
    expect(section).toContain('<UPageHero')
    expect(section).toContain('<UPageSection')
    expect(section).toContain('<UPageCTA')
    expect(section).not.toContain(':is="resolved.componentName"')
    expect(faq).toContain('<UAccordion')
    expect(faq).toContain(':unmount-on-hide="false"')
    expect(logos).toContain('grid-cols-2')
    expect(logos).toContain('sm:grid-cols-4')
    expect(media).toContain('border-muted')
    expect(media).toContain('bg-muted/40')
    expect(fixtureHarness).toContain('data-page-pattern-fixture')
    expect(fixtureHarness).toContain('<PageDocumentRenderer')
  })

  it('documents copy-on-insert upgrades without rewriting existing pages', async () => {
    const docs = await readFile(resolve(projectRoot, 'docs/page-patterns.md'), 'utf8')
    expect(docs).toContain('copy-on-insert')
    expect(docs).toContain('Existing pages are never rewritten automatically')
    expect(docs).toContain('1280 × 900')
    expect(docs).toContain('390 × 844')
  })
})
