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
      'app/pages/_desk/site/menus.vue'
    ]
    const [component, deskLayout, settingsPage, composable, ...pages] = await Promise.all([
      readFile(resolve(root, 'app/components/SiteAdminSection.vue'), 'utf8'),
      readFile(resolve(root, 'app/layouts/desk.vue'), 'utf8'),
      readFile(resolve(root, 'app/pages/_desk/settings/site.vue'), 'utf8'),
      readFile(resolve(root, 'app/composables/useSiteModeSettings.ts'), 'utf8'),
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
    expect(deskLayout).toContain('buildSiteAdminNavigation(route.path, siteModeEnabled.value)')
    expect(deskLayout).toContain('v-model="openNavItems"')
    expect(deskLayout).toContain('watch(siteModeEnabled, enabled => setNavigationOpen(\'site\', enabled), { immediate: true })')
    expect(deskLayout).toContain(':collapsed="collapsed"')
    expect(deskLayout).toContain(':popover="collapsed"')
    expect(settingsPage).toContain('v-model="modeState.enabled"')
    expect(settingsPage).toContain('Save Site mode')
    expect(composable).toContain('const SITE_MODE_DATA_KEY = \'site-mode\'')
    expect(composable).toContain('result.data.value = response')
  })

  it('provides useful, resilient status and compatibility links without resource mutation controls', async () => {
    const root = resolve(import.meta.dirname, '..')
    const [overview, themes, layouts, menus] = await Promise.all([
      readFile(resolve(root, 'app/pages/_desk/site/index.vue'), 'utf8'),
      readFile(resolve(root, 'app/pages/_desk/site/themes.vue'), 'utf8'),
      readFile(resolve(root, 'app/pages/_desk/site/layouts.vue'), 'utf8'),
      readFile(resolve(root, 'app/pages/_desk/site/menus.vue'), 'utf8')
    ])

    expect(overview).toContain('Active presentation')
    expect(overview).toContain('Default SiteLayout: none')
    expect(overview).toContain('Not available yet')
    expect(overview).toContain('/_desk/site/themes')
    expect(overview).toContain('/_desk/site/layouts')
    expect(overview).toContain('/_desk/site/menus')
    expect(themes).toContain('/_desk/settings/appearance')
    expect(menus).toContain('/_desk/settings/navigation')
    expect(layouts).toContain('SiteLayouts are persisted HaloPress resources')

    for (const placeholder of [themes, layouts, menus]) {
      expect(placeholder).not.toContain('method: \'POST\'')
      expect(placeholder).not.toContain('method: \'PUT\'')
      expect(placeholder).not.toContain('method: \'DELETE\'')
    }
  })

  it('keeps SiteLayout resources isolated from Nuxt layouts and public delivery', async () => {
    const root = resolve(import.meta.dirname, '..')
    const [docs, publicLayout, publicCatchAll, publicPresentationRoute] = await Promise.all([
      readFile(resolve(root, 'docs/SETTINGS.md'), 'utf8'),
      readFile(resolve(root, 'app/layouts/default.vue'), 'utf8'),
      readFile(resolve(root, 'app/pages/[...path].vue'), 'utf8'),
      readFile(resolve(root, 'server/api/delivery/site-presentation.get.ts'), 'utf8')
    ])

    expect(docs).toContain('`SiteLayout` is the HaloPress domain name')
    expect(docs).toContain('It is not a Nuxt application layout')
    for (const publicSurface of [publicLayout, publicCatchAll, publicPresentationRoute]) {
      expect(publicSurface).not.toContain('SiteAdminSection')
      expect(publicSurface).not.toContain('site-mode')
      expect(publicSurface).not.toContain('app/layouts/desk.vue')
    }
  })
})
