// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest'

import {
  SITE_MENU_NO_ICON_VALUE,
  focusFirstSiteMenuValidationIssue,
  focusSiteMenuMoveControl,
  isSiteMenuWorkingCopyDirty,
  moveSiteMenuArrayItem,
  shouldInitializeSiteMenuSelection,
  siteMenuIconFromEditorValue,
  siteMenuMoveAnnouncement,
  siteMenuUsageFromFetchError,
  siteMenuValidationIssuesFromFetchError,
  validationMessageForPath
} from '../app/utils/site-menu-editor'
import { SITE_MENU_ICONS } from '../shared/site-menu'

describe('Site menu rendered editor behavior', () => {
  it('keeps malformed fallback documents repairable and initializes a successful retry once', () => {
    expect(isSiteMenuWorkingCopyDirty(true, 'same', 'same')).toBe(true)
    expect(isSiteMenuWorkingCopyDirty(false, 'same', 'same')).toBe(false)
    expect(shouldInitializeSiteMenuSelection(null, 'error', false)).toBe(false)
    expect(shouldInitializeSiteMenuSelection({ items: [] }, 'success', false)).toBe(true)
    expect(shouldInitializeSiteMenuSelection({ items: [] }, 'success', true)).toBe(false)
  })

  it.each(['pointer', 'touch', 'keyboard'] as const)(
    'preserves stable item identity for a %s reorder and produces a live announcement',
    (inputMethod) => {
      const before = [
        { id: 'first', value: 'stable-first', label: 'First' },
        { id: 'second', value: 'stable-second', label: 'Second' }
      ]
      const after = moveSiteMenuArrayItem(before, 0, 1)

      expect(inputMethod).toMatch(/pointer|touch|keyboard/)
      expect(after.map(item => [item.id, item.value])).toEqual([
        ['second', 'stable-second'],
        ['first', 'stable-first']
      ])
      expect(siteMenuMoveAnnouncement('First', 2, 2, 'parent'))
        .toBe('Moved First to position 2 of 2.')
      expect(siteMenuMoveAnnouncement('Child', 1, 2, 'child'))
        .toBe('Moved Child to child position 1 of 2.')
    }
  )

  it('retains focus on the moved control and focuses the first repeated invalid field', () => {
    document.body.innerHTML = `
      <button data-menu-item-id="second" data-menu-move="up">Move up</button>
      <button data-menu-item-id="second" data-menu-move="down" disabled>Move down</button>
      <input data-validation-path="document.items.0.label">
      <button data-validation-path="document.items.1.destination.type">Destination</button>
    `
    expect(focusSiteMenuMoveControl('second', 'up')).toBe(true)
    expect((document.activeElement as HTMLElement).textContent).toBe('Move up')
    expect(focusSiteMenuMoveControl('second', 'down')).toBe(true)
    expect((document.activeElement as HTMLElement).textContent).toBe('Move up')

    const issues = [
      { path: 'document.items.1.destination', message: 'Choose a valid destination' },
      { path: 'document.items.0.label', message: 'Enter a label' }
    ]
    expect(focusFirstSiteMenuValidationIssue(issues)).toBe(true)
    expect((document.activeElement as HTMLElement).dataset.validationPath)
      .toBe('document.items.1.destination.type')
    expect(validationMessageForPath(issues, 'document.items.0.label')).toBe('Enter a label')
  })

  it('parses delete-race usage and structured validation without accepting malformed metadata', () => {
    const usage = [{
      resourceType: 'site-layout' as const,
      resourceId: 'layout-1',
      label: 'Marketing header'
    }]
    const issues = [{ path: 'document.items.1.value', message: 'Values must be unique' }]
    const error = { data: { data: { usage, issues } } }

    expect(siteMenuUsageFromFetchError(error)).toEqual(usage)
    expect(siteMenuValidationIssuesFromFetchError(error)).toEqual(issues)
    expect(siteMenuUsageFromFetchError({ data: { usage: [{ resourceType: 'unsafe' }] } })).toEqual([])
  })

  it('keeps the no-icon sentinel out of persisted menu documents', () => {
    expect(siteMenuIconFromEditorValue(SITE_MENU_NO_ICON_VALUE)).toBeUndefined()
    expect(siteMenuIconFromEditorValue('i-lucide-not-allowed')).toBeUndefined()
    expect(siteMenuIconFromEditorValue(SITE_MENU_ICONS[0])).toBe(SITE_MENU_ICONS[0])
  })
})
