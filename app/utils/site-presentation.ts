import type { NavigationMenuItem } from '@nuxt/ui'
import {
  resolvePublicNavigationTarget,
  type PublicNavigationLeaf,
  type PublicSitePresentation
} from '~~/shared/site-presentation'

const colorShades = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'] as const

export function siteThemeStyle(presentation: PublicSitePresentation) {
  const style: Record<string, string> = {}
  for (const shade of colorShades) {
    style[`--ui-color-primary-${shade}`] = `var(--color-${presentation.appearance.primaryColor}-${shade})`
    style[`--ui-color-neutral-${shade}`] = `var(--color-${presentation.appearance.neutralColor}-${shade})`
  }
  style['--ui-radius'] = ({ none: '0rem', sm: '0.125rem', md: '0.25rem', lg: '0.5rem' })[presentation.appearance.radius]
  style['--site-line-height'] = ({ compact: '1.45', default: '1.6', relaxed: '1.75' })[presentation.appearance.typographyScale]
  if (presentation.shell.width === 'wide') style['--ui-container'] = '96rem'
  if (presentation.shell.width === 'centered') style['--ui-container'] = '64rem'
  return style
}

function navigationLeaf(item: PublicNavigationLeaf, currentPath: string): NavigationMenuItem {
  const to = resolvePublicNavigationTarget(item.destination)
  const external = item.destination.type === 'external'
  const newWindow = item.destination.type === 'external' && item.destination.newWindow
  return {
    label: item.label,
    to,
    active: !external && (currentPath === to || (to !== '/' && currentPath.startsWith(to))),
    target: newWindow ? '_blank' : undefined,
    rel: newWindow ? 'noopener noreferrer' : undefined
  }
}

export function siteNavigationItems(presentation: PublicSitePresentation, currentPath: string): NavigationMenuItem[] {
  return presentation.navigation.items.map(item => ({
    ...navigationLeaf(item, currentPath),
    children: item.children.map(child => navigationLeaf(child, currentPath))
  }))
}

export function siteFooterLinks(presentation: PublicSitePresentation, currentPath: string): NavigationMenuItem[] {
  return presentation.footer.links.map(item => navigationLeaf(item, currentPath))
}
