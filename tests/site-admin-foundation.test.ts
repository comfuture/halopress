import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  SITE_ADMIN_CHILD_SECTIONS,
  SITE_ADMIN_SECTIONS,
  buildSiteAdminNavigation,
  findSiteAdminSection,
  isSiteAdminRouteActive
} from '../shared/site-admin-sections'

describe('Site administration foundation', () => {
  it('owns one overview and exactly the Themes, Layouts, and Menus child routes', () => {
    expect(SITE_ADMIN_SECTIONS.map(section => section.id)).toEqual([
      'overview',
      'themes',
      'layouts',
      'menus'
    ])
    expect(SITE_ADMIN_SECTIONS.map(section => section.to)).toEqual([
      '/_desk/site',
      '/_desk/site/themes',
      '/_desk/site/layouts',
      '/_desk/site/menus'
    ])
    expect(SITE_ADMIN_CHILD_SECTIONS.map(section => section.label)).toEqual(['Themes', 'Layouts', 'Menus'])
    expect(new Set(SITE_ADMIN_SECTIONS.map(section => section.to)).size).toBe(SITE_ADMIN_SECTIONS.length)
  })

  it('hides the entire navigation when disabled and marks exact or deep routes when enabled', () => {
    expect(buildSiteAdminNavigation('/_desk/site', false)).toBeNull()

    const overview = buildSiteAdminNavigation('/_desk/site', true)
    expect(overview).toMatchObject({
      label: 'Site',
      to: '/_desk/site',
      value: 'site',
      active: true,
      children: [
        { label: 'Themes', to: '/_desk/site/themes', active: false },
        { label: 'Layouts', to: '/_desk/site/layouts', active: false },
        { label: 'Menus', to: '/_desk/site/menus', active: false }
      ]
    })

    const deepLayout = buildSiteAdminNavigation('/_desk/site/layouts/layout-1/edit', true)
    expect(deepLayout?.active).toBe(true)
    expect(deepLayout?.children.map(child => child.active)).toEqual([false, true, false])
    expect(buildSiteAdminNavigation('/_desk/site-other', true)?.active).toBe(false)
    expect(isSiteAdminRouteActive('/_desk/site/themes-extra', findSiteAdminSection('themes'))).toBe(false)
  })

  it('uses one administrator-only section component for overview and child routes', async () => {
    const root = resolve(import.meta.dirname, '..')
    const pagePaths = [
      'app/pages/_desk/site/index.vue',
      'app/pages/_desk/site/themes.vue',
      'app/pages/_desk/site/layouts.vue',
      'app/pages/_desk/site/menus/index.vue',
      'app/pages/_desk/site/menus/[menuId].vue'
    ]
    const [component, deskLayout, settingsPage, composable, presentationComposable, ...pages] = await Promise.all([
      readFile(resolve(root, 'app/components/SiteAdminSection.vue'), 'utf8'),
      readFile(resolve(root, 'app/layouts/desk.vue'), 'utf8'),
      readFile(resolve(root, 'app/pages/_desk/settings/site.vue'), 'utf8'),
      readFile(resolve(root, 'app/composables/useSiteModeSettings.ts'), 'utf8'),
      readFile(resolve(root, 'app/composables/useSitePresentationSettings.ts'), 'utf8'),
      ...pagePaths.map(path => readFile(resolve(root, path), 'utf8'))
    ])

    for (const page of pages) {
      expect(page).toContain('layout: \'desk\'')
      expect(page).toContain('<SiteAdminSection')
    }
    expect(pages[0]).not.toContain('navigateTo(')
    expect(component).toContain('Site features are disabled')
    expect(component).toContain('Open Site settings')
    expect(component).toContain('aria-label="Site location"')
    expect(component).toContain('aria-label="Site sections"')
    expect(component).toContain('v-if="verifyingMode"')
    expect(component).not.toContain('await useSiteMode()')
    expect(deskLayout).toContain('buildSiteAdminNavigation(route.path, siteModeEnabled.value)')
    expect(deskLayout).toContain('const { enabled: siteModeEnabled } = useSiteMode()')
    expect(deskLayout).toContain('await useFetch<{ items: any[] }>(\'/api/schema/list\')')
    expect(deskLayout).not.toContain('await Promise.all')
    expect(deskLayout).toContain('v-model="openNavItems"')
    expect(deskLayout).toContain('watch(siteModeEnabled, enabled => setNavigationOpen(\'site\', enabled), { immediate: true })')
    expect(deskLayout).toContain(':collapsed="collapsed"')
    expect(deskLayout).toContain(':popover="collapsed"')
    expect(settingsPage).toContain('v-model="modeState.enabled"')
    expect(settingsPage).toContain('Save Site mode')
    expect(settingsPage).toContain(':disabled="modeControlsDisabled"')
    expect(composable).toContain('export function useSiteMode()')
    expect(composable).toContain('export function useSiteModeSettings()')
    expect(composable).not.toContain('export async function useSiteMode')
    expect(composable).not.toContain('await useFetch')
    expect(composable).toContain('const SITE_MODE_DATA_KEY = \'site-mode\'')
    expect(composable).toContain('result.data.value = response')
    expect(presentationComposable).toContain('export function useSitePresentationStatus()')
    expect(presentationComposable).toContain('export async function useSitePresentationSettings()')
  })

  it('provides useful, resilient status and compatibility links without resource mutation controls', async () => {
    const root = resolve(import.meta.dirname, '..')
    const [overview, themes, layouts, menus, menuEditor] = await Promise.all([
      readFile(resolve(root, 'app/pages/_desk/site/index.vue'), 'utf8'),
      readFile(resolve(root, 'app/pages/_desk/site/themes.vue'), 'utf8'),
      readFile(resolve(root, 'app/pages/_desk/site/layouts.vue'), 'utf8'),
      readFile(resolve(root, 'app/pages/_desk/site/menus/index.vue'), 'utf8'),
      readFile(resolve(root, 'app/pages/_desk/site/menus/[menuId].vue'), 'utf8')
    ])

    expect(overview).toContain('Active presentation')
    expect(overview).toContain('aria-label="Loading Site overview"')
    expect(overview).toContain('useSitePresentationStatus()')
    expect(overview).not.toContain('await useSitePresentationSettings()')
    expect(overview).toContain('Default Layout: none')
    expect(overview).toContain('menuSetCount')
    expect(overview).toContain('useSiteMenusStatus()')
    expect(overview).toContain('/_desk/site/themes')
    expect(overview).toContain('/_desk/site/layouts')
    expect(overview).toContain('/_desk/site/menus')
    expect(themes).toContain('Active theme')
    expect(themes).toContain('<UForm')
    expect(themes).toContain('<UInputNumber')
    expect(themes).toContain('<USlideover')
    expect(themes).toContain('useUnsavedNavigationGuard')
    expect(themes).toContain('siteThemeAccessibilityWarnings')
    expect(themes).not.toContain('unmount-on-hide')
    expect(menus).toContain('<template #actions>')
    expect(menus).toContain('<UModal')
    expect(menus).toContain('data-menu-create-trigger')
    expect(menus).not.toContain('aria-labelledby="menu-create-heading"')
    expect(menus).not.toContain('Save menu')
    expect(menus).not.toContain('SiteMenuItemList')
    expect(menuEditor).toContain('Save menu')
    expect(menuEditor).toContain('SiteMenuItemList')
    expect(menuEditor).toContain('Back to menu sets')
    expect(layouts).toContain('persisted Layouts remain isolated')

    for (const placeholder of [layouts]) {
      expect(placeholder).not.toContain('method: \'POST\'')
      expect(placeholder).not.toContain('method: \'PUT\'')
      expect(placeholder).not.toContain('method: \'DELETE\'')
    }
  })

  it('keeps Layout resources isolated from Nuxt layouts and public delivery', async () => {
    const root = resolve(import.meta.dirname, '..')
    const [docs, publicLayout, publicCatchAll, publicPresentationRoute] = await Promise.all([
      readFile(resolve(root, 'docs/SETTINGS.md'), 'utf8'),
      readFile(resolve(root, 'app/layouts/default.vue'), 'utf8'),
      readFile(resolve(root, 'app/pages/[...path].vue'), 'utf8'),
      readFile(resolve(root, 'server/api/delivery/site-presentation.get.ts'), 'utf8')
    ])

    expect(docs).toContain('`Layout` is the HaloPress domain name')
    expect(docs).toContain('It is not a Nuxt application layout')
    for (const publicSurface of [publicLayout, publicCatchAll, publicPresentationRoute]) {
      expect(publicSurface).not.toContain('SiteAdminSection')
      expect(publicSurface).not.toContain('site-mode')
      expect(publicSurface).not.toContain('app/layouts/desk.vue')
    }
  })
})
