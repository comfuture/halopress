import {
  SITE_MENU_ICONS,
  type SiteMenuUsage,
  type SiteMenuValidationIssue
} from '~~/shared/site-menu'

export const SITE_MENU_NO_ICON_VALUE = '__none__'

export function siteMenuIconFromEditorValue(value: string): typeof SITE_MENU_ICONS[number] | undefined {
  return SITE_MENU_ICONS.find(icon => icon === value)
}

export function shouldInitializeSiteMenuSelection(
  response: unknown,
  requestStatus: string,
  hasWorkingCopy: boolean
) {
  return Boolean(response) && requestStatus === 'success' && !hasWorkingCopy
}

export function isSiteMenuWorkingCopyDirty(
  malformedStoredValue: boolean,
  currentSnapshot: string,
  baselineSnapshot: string
) {
  return malformedStoredValue || currentSnapshot !== baselineSnapshot
}

export function moveSiteMenuArrayItem<T>(items: readonly T[], from: number, to: number) {
  if (from < 0 || from >= items.length || to < 0 || to >= items.length || from === to) return [...items]
  const next = [...items]
  const [item] = next.splice(from, 1)
  if (item !== undefined) next.splice(to, 0, item)
  return next
}

export function siteMenuMoveAnnouncement(
  label: string,
  position: number,
  total: number,
  level: 'parent' | 'child'
) {
  return `Moved ${label} to ${level === 'child' ? 'child ' : ''}position ${position} of ${total}.`
}

export function focusSiteMenuMoveControl(
  itemId: string,
  direction: 'up' | 'down'
) {
  const controls = document.querySelectorAll<HTMLElement>('[data-menu-item-id][data-menu-move]')
  const itemControls = [...controls].filter(candidate => candidate.dataset.menuItemId === itemId)
  const requested = itemControls.find(candidate => candidate.dataset.menuMove === direction)
  const control = requested && !requested.hasAttribute('disabled')
    ? requested
    : itemControls.find(candidate => !candidate.hasAttribute('disabled'))
  if (!control) return false
  control.focus()
  return true
}

function objectField(value: unknown, key: string): unknown {
  return value && typeof value === 'object' ? Reflect.get(value, key) : undefined
}

function responsePayload(error: unknown) {
  const response = objectField(error, 'data')
  return objectField(response, 'data') ?? response
}

export function siteMenuUsageFromFetchError(error: unknown): SiteMenuUsage[] | null {
  const usage = objectField(responsePayload(error), 'usage')
  if (!Array.isArray(usage)) return null
  const parsed = usage.flatMap((item): SiteMenuUsage[] => {
    const resourceType = objectField(item, 'resourceType')
    const resourceId = objectField(item, 'resourceId')
    const label = objectField(item, 'label')
    if ((resourceType !== 'public-site-shell' && resourceType !== 'site-layout')
      || typeof resourceId !== 'string' || typeof label !== 'string') return []
    return [{ resourceType, resourceId, label }]
  })
  return parsed
}

export function siteMenuValidationIssuesFromFetchError(error: unknown): SiteMenuValidationIssue[] {
  const issues = objectField(responsePayload(error), 'issues')
  if (!Array.isArray(issues)) return []
  return issues.flatMap((item): SiteMenuValidationIssue[] => {
    const path = objectField(item, 'path')
    const message = objectField(item, 'message')
    return typeof path === 'string' && typeof message === 'string' ? [{ path, message }] : []
  })
}

export function validationMessageForPath(issues: readonly SiteMenuValidationIssue[], path: string) {
  return issues.find(issue => issue.path === path)?.message
}

export function focusFirstSiteMenuValidationIssue(issues: readonly SiteMenuValidationIssue[]) {
  const controls = document.querySelectorAll<HTMLElement>('[data-validation-path]')
  for (const issue of issues) {
    const control = [...controls].find(candidate => candidate.dataset.validationPath === issue.path)
      ?? [...controls].find(candidate => candidate.dataset.validationPath?.startsWith(`${issue.path}.`))
    if (!control) continue
    control.focus()
    return true
  }
  return false
}
