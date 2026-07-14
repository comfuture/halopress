import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { buildPageDocumentSegments, sanitizePageDocument } from '../app/editor/page/render-document'
import { commitPageBlockLink, createPageBlockLinkDrafts, movePageBlockLink } from '../app/editor/page/links'
import { pageBlockRegistry } from '../app/editor/page/registry'
import { normalizePageContent } from '../server/cms/page-content'
import { resolvePageBlock } from '../shared/page-blocks'

describe('page block registry', () => {
  it('exposes typed link controls only for hero and CTA blocks', () => {
    expect(pageBlockRegistry.byKey.pageHero.fields.some(field => field.type === 'link-list')).toBe(true)
    expect(pageBlockRegistry.byKey.pageCTA.fields.some(field => field.type === 'link-list')).toBe(true)
    expect(pageBlockRegistry.byKey.pageCard.fields.some(field => field.type === 'link-list')).toBe(false)
  })

  it('commits safe link drafts while preserving curated optional properties', () => {
    const [draft] = createPageBlockLinkDrafts([{
      label: 'Old',
      to: '/old',
      target: '_blank',
      icon: 'i-lucide-arrow-right',
      color: 'primary',
      unchecked: 'drop me'
    }])
    draft!.label = 'Docs'
    draft!.to = '/docs'
    draft!.target = '_self'

    expect(commitPageBlockLink([draft!.original], 0, draft!)).toEqual({
      links: [{
        label: 'Docs',
        to: '/docs',
        icon: 'i-lucide-arrow-right',
        color: 'primary'
      }]
    })
    expect(commitPageBlockLink([], 0, {
      label: 'Unsafe',
      to: 'javascript:alert(1)',
      target: '_self',
      original: {}
    })).toHaveProperty('error')
  })

  it('moves link drafts without revalidating or discarding incomplete input', () => {
    const drafts = createPageBlockLinkDrafts([
      { label: 'First', to: '/first' },
      { label: 'Second', to: '/second' }
    ])
    drafts[0]!.to = 'javascript:in-progress'

    const moved = movePageBlockLink(drafts, [
      { label: 'First', to: '/first' },
      { label: 'Second', to: '/second' }
    ], 0, 1)

    expect(moved?.drafts.map(draft => draft.to)).toEqual(['/second', 'javascript:in-progress'])
    expect(moved?.links).toEqual([
      { label: 'Second', to: '/second' },
      { label: 'First', to: '/first' }
    ])
  })

  it('updates inspector attributes without forcing editor focus or cached node positions', async () => {
    const root = resolve(import.meta.dirname, '..')
    const editor = await readFile(resolve(root, 'app/components/PageEditor.vue'), 'utf8')
    const inspector = await readFile(resolve(root, 'app/components/page-editor/PageBlockInspector.vue'), 'utf8')

    expect(inspector).toContain('@update:model-value="updateLink(index, \'label\', $event)"')
    expect(inspector).toContain('@update:model-value="updateLink(index, \'to\', $event)"')
    expect(inspector).toContain('if (samePageBlockAttrs(attrs)) return')
    expect(editor).toContain('editor.commands.updatePageBlockAttributes(attrs)')
    expect(editor).not.toContain('.focus()')
    expect(editor).not.toContain('selectedBlock.value.pos')
  })

  it('resolves only code-owned components and strips unchecked properties', () => {
    const resolved = resolvePageBlock({
      component: 'pageCard',
      props: {
        title: 'Safe card',
        to: '/articles/1',
        target: '_blank',
        ui: { root: 'fixed inset-0' },
        class: 'fixed inset-0',
        onClick: 'alert(1)'
      },
      advanced: { is: 'script', onClick: 'alert(1)' },
      media: { url: '/assets/card/raw', alt: 'Card', class: 'fixed inset-0' }
    })

    expect(resolved).toEqual({
      status: 'known',
      key: 'pageCard',
      componentName: 'UPageCard',
      props: {
        title: 'Safe card',
        description: '',
        to: '/articles/1',
        target: '_blank'
      },
      media: { url: '/assets/card/raw', alt: 'Card' }
    })
  })

  it('uses deterministic fallbacks for unknown and malformed blocks', () => {
    expect(resolvePageBlock({ component: 'RetiredMarketingWidget', props: {} })).toEqual({
      status: 'unknown',
      key: 'RetiredMarketingWidget',
      reason: 'Unsupported page block'
    })
    expect(resolvePageBlock({
      component: 'pageCard',
      props: { title: 'Unsafe', to: 'javascript:alert(1)' }
    })).toEqual({
      status: 'malformed',
      key: 'pageCard',
      reason: 'Invalid page block properties'
    })
  })
})

describe('page document renderer', () => {
  const fixture = {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 2, class: 'unchecked' },
        content: [{ type: 'text', text: 'Ordinary heading', marks: [{ type: 'bold' }] }]
      },
      {
        type: 'paragraph',
        content: [{
          type: 'text',
          text: 'Unsafe link becomes plain text',
          marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)', class: 'unchecked' } }]
        }]
      },
      {
        type: 'pageBlock',
        attrs: { component: 'pageHero', props: { title: 'Hero' }, advanced: { class: 'unchecked' } }
      },
      {
        type: 'pageBlock',
        attrs: { component: 'RetiredBlock', props: { preserved: true } }
      },
      { type: 'paragraph', content: [{ type: 'text', text: 'After blocks' }] }
    ]
  }

  it('renders ordinary Tiptap nodes around page blocks with stable segments', () => {
    const before = JSON.stringify(fixture)
    const first = buildPageDocumentSegments(fixture)
    const second = buildPageDocumentSegments(fixture)

    expect(first).toEqual(second)
    expect(first.map(segment => segment.kind)).toEqual(['html', 'block', 'block', 'html'])
    expect(first[0]).toMatchObject({ kind: 'html' })
    expect((first[0] as any).html).toContain('<h2><strong>Ordinary heading</strong></h2>')
    expect((first[0] as any).html).not.toContain('javascript:')
    expect((first[0] as any).html).not.toContain('unchecked')
    expect(first[2]).toMatchObject({
      kind: 'block',
      attrs: { component: 'RetiredBlock', props: { preserved: true } }
    })
    expect(JSON.stringify(fixture)).toBe(before)
  })

  it('sanitizes arbitrary Tiptap attributes and unsafe media', () => {
    const sanitized = sanitizePageDocument({
      type: 'doc',
      content: [
        { type: 'image', attrs: { src: 'data:text/html;base64,WA==', class: 'fixed' } },
        { type: 'paragraph', attrs: { class: 'fixed', textAlign: 'center' }, content: [{ type: 'text', text: '<safe>' }] }
      ]
    })
    expect(sanitized).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '[Unsupported content: image]' }] },
        { type: 'paragraph', attrs: { textAlign: 'center' }, content: [{ type: 'text', text: '<safe>', marks: undefined }] }
      ]
    })
  })

  it('preserves unknown blocks at storage validation while rejecting non-documents', () => {
    const unknown = {
      type: 'doc',
      content: [{ type: 'pageBlock', attrs: { component: 'RetiredBlock', props: { legacy: true } } }]
    }
    expect(normalizePageContent(unknown)).toEqual(unknown)
    expect(() => normalizePageContent({ type: 'script', content: [] })).toThrow('Page content must be a Tiptap document')
  })

  it('keeps editor-only selection state outside the shared view and public renderer', async () => {
    const root = resolve(import.meta.dirname, '..')
    const view = await readFile(resolve(root, 'app/editor/page/PageBlockView.vue'), 'utf8')
    const nodeView = await readFile(resolve(root, 'app/editor/page/PageBlockNodeView.vue'), 'utf8')
    const renderer = await readFile(resolve(root, 'app/components/PageDocumentRenderer.vue'), 'utf8')

    expect(view).not.toContain('selected')
    expect(view).not.toContain('ring-2')
    expect(nodeView).toContain('props.selected')
    expect(nodeView).toContain('<PageBlockView')
    expect(renderer).toContain('<PageBlockView')
    expect(renderer).not.toContain('PageBlockNodeView')
    expect(renderer).not.toContain('ring-2')
  })
})
