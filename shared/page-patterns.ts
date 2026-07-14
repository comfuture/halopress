import {
  isPageBlockComponentKey,
  isValidCuratedPageBlockAttrs,
  type PageBlockComponentKey,
  type StoredPageBlockAttrs
} from './page-blocks'

export const PAGE_PATTERN_CONTRACT_VERSION = 1
export const PAGE_BLOCK_REGISTRY_VERSION = 1

export type PagePatternNode = {
  type: 'pageBlock'
  attrs: StoredPageBlockAttrs & { component: PageBlockComponentKey }
}

export type PagePatternDefinition = {
  key: string
  version: number
  label: string
  summary: string
  category: 'Starter' | 'Hero' | 'Content' | 'Trust' | 'FAQ' | 'Conversion'
  icon: string
  keywords: string[]
  insertion: 'pattern'
  compatibility: {
    editor: 'page'
    patternContract: typeof PAGE_PATTERN_CONTRACT_VERSION
    blockRegistry: typeof PAGE_BLOCK_REGISTRY_VERSION
    requiredBlocks: PageBlockComponentKey[]
  }
  content: {
    type: 'doc'
    content: PagePatternNode[]
  }
}

function block(
  component: PageBlockComponentKey,
  props: Record<string, unknown>,
  media: Record<string, unknown> = {}
): PagePatternNode {
  return {
    type: 'pageBlock',
    attrs: { component, props, advanced: {}, media }
  }
}

function pattern(
  definition: Omit<PagePatternDefinition, 'version' | 'insertion' | 'compatibility'>
    & { requiredBlocks: PageBlockComponentKey[] }
): PagePatternDefinition {
  const { requiredBlocks, ...metadata } = definition
  return {
    ...metadata,
    version: 1,
    insertion: 'pattern',
    compatibility: {
      editor: 'page',
      patternContract: PAGE_PATTERN_CONTRACT_VERSION,
      blockRegistry: PAGE_BLOCK_REGISTRY_VERSION,
      requiredBlocks
    }
  }
}

export const pagePatternKeys = [
  'centered-hero',
  'split-hero',
  'feature-grid',
  'media-content',
  'testimonial-social-proof',
  'faq',
  'closing-cta',
  'starter-page'
] as const
export type PagePatternKey = typeof pagePatternKeys[number]

export const pagePatternDefinitions: PagePatternDefinition[] = [
  pattern({
    key: 'centered-hero',
    label: 'Centered hero',
    summary: 'A focused introduction with two clear next steps.',
    category: 'Hero',
    icon: 'i-lucide-align-center',
    keywords: ['banner', 'headline', 'introduction', 'landing'],
    requiredBlocks: ['pageHero'],
    content: {
      type: 'doc',
      content: [block('pageHero', {
        headline: '[Add an eyebrow]',
        title: '[Add your primary promise]',
        description: '[Explain who this is for and why it matters.]',
        orientation: 'vertical',
        links: [
          { label: '[Primary action]', to: '#next', icon: 'i-lucide-arrow-right' },
          { label: '[Secondary action]', to: '#details', color: 'neutral', variant: 'subtle' }
        ]
      })]
    }
  }),
  pattern({
    key: 'split-hero',
    label: 'Split hero',
    summary: 'A horizontal hero with an intentional media placeholder.',
    category: 'Hero',
    icon: 'i-lucide-columns-2',
    keywords: ['banner', 'image', 'media', 'product'],
    requiredBlocks: ['pageHero'],
    content: {
      type: 'doc',
      content: [block('pageHero', {
        headline: '[Add an eyebrow]',
        title: '[Add your product promise]',
        description: '[Describe the outcome in one or two concise sentences.]',
        orientation: 'horizontal',
        links: [{ label: '[Primary action]', to: '#next', icon: 'i-lucide-arrow-right' }]
      }, {
        url: '',
        alt: '',
        requiredAction: 'Add a hero image and descriptive alternative text.'
      })]
    }
  }),
  pattern({
    key: 'feature-grid',
    label: 'Feature grid',
    summary: 'A reviewed three-feature section with typed icons and copy.',
    category: 'Content',
    icon: 'i-lucide-grid-3x3',
    keywords: ['benefits', 'capabilities', 'features', 'grid'],
    requiredBlocks: ['pageSection'],
    content: {
      type: 'doc',
      content: [block('pageSection', {
        headline: 'Why it works',
        title: '[Add the section promise]',
        description: '[Connect these capabilities to a concrete reader outcome.]',
        features: [
          { title: '[Feature one]', description: '[Explain the first benefit.]', icon: 'i-lucide-sparkles', orientation: 'vertical' },
          { title: '[Feature two]', description: '[Explain the second benefit.]', icon: 'i-lucide-badge-check', orientation: 'vertical' },
          { title: '[Feature three]', description: '[Explain the third benefit.]', icon: 'i-lucide-heart', orientation: 'vertical' }
        ]
      })]
    }
  }),
  pattern({
    key: 'media-content',
    label: 'Media and content',
    summary: 'A responsive content section paired with an authored asset.',
    category: 'Content',
    icon: 'i-lucide-panel-left',
    keywords: ['image', 'media', 'product', 'story'],
    requiredBlocks: ['pageSection'],
    content: {
      type: 'doc',
      content: [block('pageSection', {
        headline: '[Add a section label]',
        title: '[Explain one important idea]',
        description: '[Add supporting detail that gives the image context.]',
        orientation: 'horizontal',
        links: [{ label: '[Learn more]', to: '#details', icon: 'i-lucide-arrow-right' }]
      }, {
        url: '',
        alt: '',
        requiredAction: 'Add a supporting image and descriptive alternative text.'
      })]
    }
  }),
  pattern({
    key: 'testimonial-social-proof',
    label: 'Testimonial and social proof',
    summary: 'A customer quote followed by a reviewed logo cloud.',
    category: 'Trust',
    icon: 'i-lucide-message-square-quote',
    keywords: ['customer', 'logos', 'proof', 'quote', 'testimonial'],
    requiredBlocks: ['pageTestimonial', 'pageLogos'],
    content: {
      type: 'doc',
      content: [
        block('pageTestimonial', {
          quote: '[Add a specific customer outcome in their own words.]',
          author: '[Add the customer name]',
          role: '[Add role]',
          company: '[Add company]'
        }, {
          url: '',
          alt: '',
          requiredAction: 'Add the customer portrait or leave this intentionally text-only.'
        }),
        block('pageLogos', {
          title: 'Trusted by teams like yours',
          items: [
            { name: '[Customer one]', src: '', alt: 'Add the Customer one logo' },
            { name: '[Customer two]', src: '', alt: 'Add the Customer two logo' },
            { name: '[Customer three]', src: '', alt: 'Add the Customer three logo' },
            { name: '[Customer four]', src: '', alt: 'Add the Customer four logo' }
          ]
        })
      ]
    }
  }),
  pattern({
    key: 'faq',
    label: 'Frequently asked questions',
    summary: 'A keyboard-accessible accordion for common objections.',
    category: 'FAQ',
    icon: 'i-lucide-circle-help',
    keywords: ['accordion', 'answers', 'questions', 'support'],
    requiredBlocks: ['pageFAQ'],
    content: {
      type: 'doc',
      content: [block('pageFAQ', {
        headline: 'Questions',
        title: 'Frequently asked questions',
        description: '[Add a short introduction or remove it.]',
        items: [
          { question: '[Add the first question]', answer: '[Add a direct, useful answer.]' },
          { question: '[Add the second question]', answer: '[Add a direct, useful answer.]' },
          { question: '[Add the third question]', answer: '[Add a direct, useful answer.]' }
        ]
      })]
    }
  }),
  pattern({
    key: 'closing-cta',
    label: 'Closing call to action',
    summary: 'A concise final prompt with primary and secondary actions.',
    category: 'Conversion',
    icon: 'i-lucide-megaphone',
    keywords: ['action', 'closing', 'conversion', 'signup'],
    requiredBlocks: ['pageCTA'],
    content: {
      type: 'doc',
      content: [block('pageCTA', {
        title: '[Restate the desired outcome]',
        description: '[Remove the last uncertainty and invite the next step.]',
        variant: 'soft',
        links: [
          { label: '[Primary action]', to: '#start', icon: 'i-lucide-arrow-right' },
          { label: '[Secondary action]', to: '#contact', color: 'neutral', variant: 'subtle' }
        ]
      })]
    }
  }),
  pattern({
    key: 'starter-page',
    label: 'Marketing starter page',
    summary: 'A complete reviewed page from hero through closing action.',
    category: 'Starter',
    icon: 'i-lucide-panels-top-left',
    keywords: ['blank alternative', 'full page', 'landing', 'starter'],
    requiredBlocks: ['pageHero', 'pageSection', 'pageTestimonial', 'pageFAQ', 'pageCTA'],
    content: {
      type: 'doc',
      content: [
        block('pageHero', {
          headline: '[Add an eyebrow]',
          title: '[Add your primary promise]',
          description: '[Explain who this is for and why it matters.]',
          orientation: 'horizontal',
          links: [{ label: '[Primary action]', to: '#features', icon: 'i-lucide-arrow-right' }]
        }, { url: '', alt: '', requiredAction: 'Add a hero image and descriptive alternative text.' }),
        block('pageSection', {
          headline: 'Why it works',
          title: '[Add the section promise]',
          description: '[Connect the capabilities to a reader outcome.]',
          features: [
            { title: '[Feature one]', description: '[Explain the benefit.]', icon: 'i-lucide-sparkles', orientation: 'vertical' },
            { title: '[Feature two]', description: '[Explain the benefit.]', icon: 'i-lucide-badge-check', orientation: 'vertical' },
            { title: '[Feature three]', description: '[Explain the benefit.]', icon: 'i-lucide-heart', orientation: 'vertical' }
          ]
        }),
        block('pageTestimonial', {
          quote: '[Add a specific customer outcome in their own words.]',
          author: '[Add the customer name]',
          role: '[Add role]',
          company: '[Add company]'
        }),
        block('pageFAQ', {
          headline: 'Questions',
          title: 'Frequently asked questions',
          items: [
            { question: '[Add the first question]', answer: '[Add a direct, useful answer.]' },
            { question: '[Add the second question]', answer: '[Add a direct, useful answer.]' }
          ]
        }),
        block('pageCTA', {
          title: '[Restate the desired outcome]',
          description: '[Invite the reader to take the next step.]',
          variant: 'soft',
          links: [{ label: '[Primary action]', to: '#start', icon: 'i-lucide-arrow-right' }]
        })
      ]
    }
  })
]

export const pagePatternRegistry = {
  patterns: pagePatternDefinitions,
  byKey: Object.fromEntries(pagePatternDefinitions.map(item => [item.key, item])) as Record<PagePatternKey, PagePatternDefinition>
}

export function validatePagePatternDefinition(definition: PagePatternDefinition) {
  const issues: string[] = []
  if (!Number.isInteger(definition.version) || definition.version < 1) issues.push('Pattern version must be a positive integer.')
  if (definition.compatibility.editor !== 'page') issues.push('Pattern is not compatible with the page editor.')
  if (definition.compatibility.patternContract !== PAGE_PATTERN_CONTRACT_VERSION) issues.push('Unsupported pattern contract version.')
  if (definition.compatibility.blockRegistry !== PAGE_BLOCK_REGISTRY_VERSION) issues.push('Unsupported block registry version.')
  if (definition.content.type !== 'doc' || !definition.content.content.length) issues.push('Pattern content must be a non-empty document fragment.')

  const required = new Set(definition.compatibility.requiredBlocks)
  definition.content.content.forEach((node, index) => {
    if (!node || typeof node !== 'object') {
      issues.push(`Pattern node ${index + 1} is invalid.`)
      return
    }
    if (node.type !== 'pageBlock') {
      issues.push(`Pattern node ${index + 1} is not a page block.`)
      return
    }
    if (!node.attrs || typeof node.attrs !== 'object' || Array.isArray(node.attrs)) {
      issues.push(`Pattern node ${index + 1} is missing attributes.`)
      return
    }
    if (!isPageBlockComponentKey(node.attrs.component)) {
      issues.push(`Pattern node ${index + 1} uses an unsupported block.`)
      return
    }
    if (!required.has(node.attrs.component)) issues.push(`Pattern node ${index + 1} is missing compatibility metadata.`)
    if (!isValidCuratedPageBlockAttrs(node.attrs)) issues.push(`Pattern node ${index + 1} has invalid curated properties.`)
  })
  return issues
}

export function clonePagePatternContent(key: PagePatternKey) {
  return structuredClone(pagePatternRegistry.byKey[key].content.content)
}

export function buildPageDocumentFromPattern(key: PagePatternKey) {
  return { type: 'doc' as const, content: clonePagePatternContent(key) }
}
