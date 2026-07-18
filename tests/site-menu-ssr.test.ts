import { renderToString } from '@vue/server-renderer'
import { createSSRApp, defineComponent, h, type PropType } from 'vue'
import { describe, expect, it } from 'vitest'

import { siteNavigationItems } from '../app/utils/site-presentation'
import type { PublicSiteMenuDocument } from '../shared/site-menu'
import { defaultSitePresentation, toPublicSitePresentation } from '../shared/site-presentation'

type RenderedNavigationItem = ReturnType<typeof siteNavigationItems>[number]

const NavigationMenuSsrContract = defineComponent({
  props: {
    items: { type: Array as PropType<RenderedNavigationItem[]>, required: true },
    orientation: { type: String as PropType<'horizontal' | 'vertical'>, required: true }
  },
  setup(props) {
    const renderItem = (item: RenderedNavigationItem) => h('li', {
      'data-value': item.value,
      'data-active': String(Boolean(item.active))
    }, [
      item.children?.length
        ? h('button', { type: 'button', 'aria-expanded': 'false' }, item.label)
        : h('a', { href: String(item.to), target: item.target, rel: item.rel }, item.label),
      item.children?.length
        ? h('ul', item.children.map(child => renderItem(child)))
        : null
    ])
    return () => h('nav', {
      'aria-orientation': props.orientation,
      'data-orientation': props.orientation
    }, h('ul', { role: props.orientation === 'horizontal' ? 'menubar' : 'menu' }, props.items.map(renderItem)))
  }
})

function presentation(document: PublicSiteMenuDocument) {
  const value = toPublicSitePresentation(defaultSitePresentation(), new Set(), 'ssr-test')
  value.navigation = document
  return value
}

describe('public Site menu SSR contract', () => {
  it.each(['horizontal', 'vertical'] as const)('renders stable canonical navigation in %s orientation', async (orientation) => {
    const items = siteNavigationItems(presentation({
      version: 1,
      items: [{
        id: 'company',
        label: 'Company',
        to: '/company',
        value: 'company-stable',
        children: [{
          id: 'team',
          label: 'Team',
          to: '/company/team',
          value: 'team-stable'
        }]
      }, {
        id: 'external',
        label: 'Partners',
        to: 'https://example.com',
        value: 'external-stable',
        target: '_blank',
        rel: 'noopener noreferrer',
        children: []
      }]
    }), '/company/team')
    const html = await renderToString(createSSRApp(NavigationMenuSsrContract, { items, orientation }))

    expect(html).toContain(`data-orientation="${orientation}"`)
    expect(html).toContain(`aria-orientation="${orientation}"`)
    expect(html).toContain('data-value="company-stable"')
    expect(html).toContain('data-value="team-stable"')
    expect(html).toContain('href="/company/team"')
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })
})
