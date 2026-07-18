import type { NavigationMenuItem } from '@nuxt/ui'
import type { ResolvedSiteMenuLeaf } from '~~/shared/site-menu'
import type { PublicSitePresentation } from '~~/shared/site-presentation'

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

function navigationLeaf(item: ResolvedSiteMenuLeaf, currentPath: string): NavigationMenuItem {
  const internal = item.to.startsWith('/')
  return {
    label: item.label,
    to: item.to,
    active: internal && (currentPath === item.to || (item.to !== '/' && currentPath.startsWith(item.to))),
    target: item.target,
    rel: item.rel,
    value: item.value,
    icon: item.icon,
    badge: item.badge
  }
}

export function siteNavigationItems(presentation: PublicSitePresentation, currentPath: string): NavigationMenuItem[] {
  return presentation.navigation.items.map((item) => {
    const parent = navigationLeaf(item, currentPath)
    const children = item.children.map(child => navigationLeaf(child, currentPath))
    if (!children.length) return parent

    // Nuxt UI otherwise treats child-bearing parents as horizontal triggers but
    // vertical links with a separate chevron. Make both orientations explicit:
    // while children exist, the parent is a trigger and its saved destination is
    // retained for use if those children are later removed.
    return {
      ...parent,
      to: undefined,
      target: undefined,
      rel: undefined,
      type: 'trigger',
      active: Boolean(parent.active || children.some(child => child.active)),
      children
    }
  })
}

export function siteFooterLinks(presentation: PublicSitePresentation, currentPath: string): NavigationMenuItem[] {
  return presentation.footer.links.map((item) => {
    const externalWindow = item.destination.type === 'external' && item.destination.newWindow
    return {
      label: item.label,
      to: item.to,
      active: item.to.startsWith('/')
        && (currentPath === item.to || (item.to !== '/' && currentPath.startsWith(item.to))),
      value: item.id,
      target: externalWindow ? '_blank' : undefined,
      rel: externalWindow ? 'noopener noreferrer' : undefined
    }
  })
}
