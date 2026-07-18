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
      defaultOpen: true,
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
    const [parents, children, editorPage] = await Promise.all([
      readFile(resolve(root, 'app/components/site-menu/SiteMenuItemList.vue'), 'utf8'),
      readFile(resolve(root, 'app/components/site-menu/SiteMenuChildList.vue'), 'utf8'),
      readFile(resolve(root, 'app/pages/_desk/site/menus/[menuId].vue'), 'utf8')
    ])

    for (const list of [parents, children]) {
      expect(list).toContain('useSortable(listRef, model')
      expect(list).toContain('watchElement: true')
      expect(list).not.toContain('sortable.start()')
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
    expect(editorPage).toContain('role="status" aria-live="polite"')
    expect(editorPage).toContain('watch([sourceResource, status, menuId]')
    expect(editorPage).toContain('!working.value || working.value.id !== resource.id')
    expect(editorPage).toContain('Save menu')
    expect(editorPage.match(/Save menu/g)).toHaveLength(2)
  })

  it('initializes after a failed request is refreshed successfully without clobbering edits', () => {
    expect(shouldInitializeSiteMenuSelection(null, 'error', false)).toBe(false)
    expect(shouldInitializeSiteMenuSelection({ items: [] }, 'success', false)).toBe(true)
    expect(shouldInitializeSiteMenuSelection({ items: [] }, 'success', true)).toBe(false)
  })

  it('offers named CRUD, one-level editing, and removes the legacy writable screen', async () => {
    const [listPage, editPage, editor, detail, parents, createModal, siteSection, legacy, layout] = await Promise.all([
      readFile(resolve(root, 'app/pages/_desk/site/menus/index.vue'), 'utf8'),
      readFile(resolve(root, 'app/pages/_desk/site/menus/[menuId].vue'), 'utf8'),
      readFile(resolve(root, 'app/components/site-menu/SiteMenuItemEditor.vue'), 'utf8'),
      readFile(resolve(root, 'app/components/site-menu/SiteMenuDetailEditor.vue'), 'utf8'),
      readFile(resolve(root, 'app/components/site-menu/SiteMenuItemList.vue'), 'utf8'),
      readFile(resolve(root, 'app/components/site-menu/SiteMenuItemCreateModal.vue'), 'utf8'),
      readFile(resolve(root, 'app/components/SiteAdminSection.vue'), 'utf8'),
      readFile(resolve(root, 'app/pages/_desk/settings/navigation.vue'), 'utf8'),
      readFile(resolve(root, 'app/components/layout-renderer/BuiltInLayoutRenderer.vue'), 'utf8')
    ])
    expect(listPage).toContain('<template #actions>')
    expect(listPage).toContain('<UModal')
    expect(listPage).toContain('<UForm')
    expect(listPage).toContain('data-menu-create-trigger')
    expect(listPage).toContain('data-menu-create-name')
    expect(listPage).toContain('@after:leave="handleCreateAfterLeave"')
    expect(listPage).toContain(':close="creating ? false : true"')
    expect(listPage).toContain('@update:open="handleCreateOpenChange"')
    expect(listPage).not.toContain('aria-labelledby="menu-create-heading"')
    expect(listPage).not.toContain('<form @submit.prevent="createSet"')
    expect(listPage).toContain('query: { created: pendingCreation.resource.id }')
    expect(listPage).toContain('data-menu-set-edit')
    expect(listPage).toContain('Delete')
    expect(listPage).not.toContain('<SiteMenuItemList')
    expect(editPage).toContain('Stable menu ID:')
    expect(editPage).toContain('Back to menu sets')
    expect(editPage).toContain('focusSiteMenuEditor(resource.id, \'name\')')
    expect(editPage).toContain('lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.85fr)]')
    expect(editPage).toContain('<USlideover')
    expect(editPage).toContain('side="right"')
    expect(editPage).toContain('@after:leave="handleMobileEditorAfterLeave"')
    expect(editPage).toContain('<SiteMenuItemList')
    expect(editPage).toContain('<SiteMenuDetailEditor')
    expect(editPage).toContain('v-if="currentResourceReady"')
    expect(editPage).toContain('kind="parent"')
    expect(editPage).toContain(':resource-id="working?.id || \'\'"')
    expect(editPage).toContain('<template #actions>')
    expect(editPage).toContain('data-menu-add-parent')
    expect(editPage).toContain('@create-child="addChild"')
    expect(editPage).not.toContain('label: \'New link\'')
    expect(editPage).not.toContain('<SiteMenuItemEditor')
    expect(parents).not.toContain('<SiteMenuItemEditor')
    expect(parents).toContain('<SiteMenuItemCreateModal')
    expect(parents).toContain('kind="child"')
    expect(parents).toContain('emit(\'createChild\', parentId, draft, submittedMenuId)')
    expect(parents).not.toContain('label: \'Child link\'')
    expect(createModal).toContain('<UModal')
    expect(createModal).toContain('<UForm')
    expect(createModal).toContain(':open="open"')
    expect(createModal).toContain('@update:open="handleOpenChange"')
    expect(createModal).toContain('@after:leave="afterLeave"')
    expect(createModal).toContain('autofocus-label')
    expect(createModal).toContain('item: siteMenuLeafSchema.parse(event.data)')
    expect(siteSection).toContain('<slot name="actions" />')
    expect(siteSection).toContain('#actions')
    expect(detail.match(/<SiteMenuItemEditor/g)).toHaveLength(1)
    expect(detail).toContain('This link opens a submenu')
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
