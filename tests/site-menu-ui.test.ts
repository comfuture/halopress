import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { siteNavigationItems } from '../app/utils/site-presentation'
import { shouldInitializeSiteMenuSelection } from '../app/utils/site-menu-editor'
import type { PublicSiteMenuDocument } from '../shared/site-menu'
import {
  defaultSitePresentation,
  toPublicSitePresentation
} from '../shared/site-presentation'

const root = resolve(import.meta.dirname, '..')

function publicPresentation(document: PublicSiteMenuDocument) {
  const presentation = toPublicSitePresentation(defaultSitePresentation(), new Set(), 'test')
  presentation.navigation = document
  return presentation
}

describe('Site menu Nuxt UI adapter', () => {
  it('emits stable safe values, metadata, canonical targets, and deterministic submenu triggers', () => {
    const presentation = publicPresentation({
      version: 1,
      items: [{
        id: 'parent-id',
        label: 'Company',
        to: '/company',
        value: 'parent-id',
        icon: 'i-lucide-info',
        badge: 2,
        children: [{
          id: 'team-id',
          value: 'team-stable',
          label: 'Team',
          to: '/company/team'
        }]
      }, {
        id: 'external-id',
        label: 'Partners',
        to: 'https://example.com',
        value: 'external-id',
        target: '_blank',
        rel: 'noopener noreferrer',
        children: []
      }]
    })

    const items = siteNavigationItems(presentation, '/company/team')
    expect(items[0]).toMatchObject({
      label: 'Company',
      value: 'parent-id',
      icon: 'i-lucide-info',
      badge: 2,
      type: 'trigger',
      active: true,
      to: undefined,
      children: [{ label: 'Team', value: 'team-stable', to: '/company/team', active: true }]
    })
    expect(items[1]).toMatchObject({
      value: 'external-id',
      to: 'https://example.com',
      target: '_blank',
      rel: 'noopener noreferrer'
    })
    expect(items[0]).not.toHaveProperty('onSelect')
    expect(items[0]).not.toHaveProperty('class')
    expect(items[0]).not.toHaveProperty('ui')
  })

  it('renders the safe empty fallback without index-derived runtime state', () => {
    expect(siteNavigationItems(publicPresentation({ version: 1, items: [] }), '/')).toEqual([])
  })
})

describe('Site menu editor interaction contract', () => {
  it('provides isolated pointer/touch sorting, exact destination indicators, and keyboard controls at both levels', async () => {
    const [parents, children, page] = await Promise.all([
      readFile(resolve(root, 'app/components/site-menu/SiteMenuItemList.vue'), 'utf8'),
      readFile(resolve(root, 'app/components/site-menu/SiteMenuChildList.vue'), 'utf8'),
      readFile(resolve(root, 'app/pages/_desk/site/menus.vue'), 'utf8')
    ])

    for (const list of [parents, children]) {
      expect(list).toContain('useSortable(listRef, model')
      expect(list).toContain('nextTick(() => sortable.start())')
      expect(list).toContain('watchElement: true')
      expect(list).toContain('forceFallback: true')
      expect(list).toContain('delayOnTouchOnly: true')
      expect(list).toContain('touchStartThreshold: 3')
      expect(list).toContain('event.willInsertAfter')
      expect(list).toContain('data-drop-indicator="before"')
      expect(list).toContain('data-drop-indicator="after"')
      expect(list).toContain('min-h-11 min-w-11')
      expect(list).toContain('i-lucide-arrow-up')
      expect(list).toContain('i-lucide-arrow-down')
      expect(list).toContain('moveArrayElement(model')
      expect(list).not.toContain('group:')
    }
    expect(parents).toContain('<SiteMenuChildList')
    expect(children).not.toContain('<SiteMenuChildList')
    expect(page).toContain('role="status" aria-live="polite"')
    expect(page).toContain('watch([data, status]')
    expect(page).toContain('shouldInitializeSiteMenuSelection(response, requestStatus, Boolean(working.value))')
    expect(page).toContain('Save menu')
    expect(page.match(/Save menu/g)).toHaveLength(1)
  })

  it('initializes after a failed request is refreshed successfully without clobbering edits', () => {
    expect(shouldInitializeSiteMenuSelection(null, 'error', false)).toBe(false)
    expect(shouldInitializeSiteMenuSelection({ items: [] }, 'success', false)).toBe(true)
    expect(shouldInitializeSiteMenuSelection({ items: [] }, 'success', true)).toBe(false)
  })

  it('offers named CRUD, one-level editing, and removes the legacy writable screen', async () => {
    const [page, editor, parents, legacy, layout] = await Promise.all([
      readFile(resolve(root, 'app/pages/_desk/site/menus.vue'), 'utf8'),
      readFile(resolve(root, 'app/components/site-menu/SiteMenuItemEditor.vue'), 'utf8'),
      readFile(resolve(root, 'app/components/site-menu/SiteMenuItemList.vue'), 'utf8'),
      readFile(resolve(root, 'app/pages/_desk/settings/navigation.vue'), 'utf8'),
      readFile(resolve(root, 'app/layouts/default.vue'), 'utf8')
    ])
    expect(page).toContain('Create a menu set')
    expect(page).toContain('Stable menu ID:')
    expect(page).toContain('Delete')
    expect(page).toContain('Save menu')
    expect(parents).toContain('Parent links act as submenu triggers')
    expect(editor).toContain('Stable value')
    expect(editor).toContain('SITE_MENU_ICONS')
    expect(editor).toContain('SITE_MENU_NO_ICON_VALUE')
    expect(editor).toContain('External URL')
    expect(legacy).toContain('navigateTo(\'/_desk/site/menus\'')
    expect(legacy).not.toContain('savePatch')

    expect(layout.match(/<UNavigationMenu/g)).toHaveLength(3)
    expect(layout).toContain(':items="navigationItems"')
    expect(layout).toContain('orientation="vertical"')
  })

  it('guards all mutation endpoints with administrator and enabled-Site checks before body reads', async () => {
    const paths = [
      'server/api/site/menus/index.post.ts',
      'server/api/site/menus/[menuId].put.ts',
      'server/api/site/menus/[menuId].delete.ts'
    ]
    for (const path of paths) {
      const source = await readFile(resolve(root, path), 'utf8')
      expect(source.indexOf('requireAdmin(event)')).toBeGreaterThan(-1)
      expect(source.indexOf('requireSiteMenusEnabled(event)')).toBeGreaterThan(source.indexOf('requireAdmin(event)'))
      if (source.includes('readBody(event)')) {
        expect(source.indexOf('requireSiteMenusEnabled(event)')).toBeLessThan(source.indexOf('readBody(event)'))
      }
    }
  })
})
