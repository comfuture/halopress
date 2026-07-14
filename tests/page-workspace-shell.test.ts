import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = resolve(import.meta.dirname, '..')

async function source(path: string) {
  return await readFile(resolve(projectRoot, path), 'utf8')
}

describe('page workspace shell', () => {
  it('guards route changes and browser unloads while edits are unsaved', async () => {
    const guard = await source('app/composables/useUnsavedNavigationGuard.ts')

    expect(guard).toContain('onBeforeRouteLeave')
    expect(guard).toContain('window.addEventListener(\'beforeunload\'')
    expect(guard).toContain('window.removeEventListener(\'beforeunload\'')
    expect(guard).toContain('return window.confirm(message)')
    expect(guard).toContain('allowNextNavigation')
  })

  it('uses the shared guard without blocking intentional post-mutation navigation', async () => {
    const [createPage, editPage] = await Promise.all([
      source('app/pages/_desk/pages/new.vue'),
      source('app/pages/_desk/pages/[id].vue')
    ])

    for (const page of [createPage, editPage]) {
      expect(page).toContain('useUnsavedNavigationGuard(isDirty)')
      expect(page).toContain('root: \'min-h-0 overflow-hidden\'')
      expect(page).toContain('body: \'min-h-0 overflow-hidden p-0 sm:p-0\'')
    }
    expect(createPage.match(/allowNextNavigation\(\)/g)).toHaveLength(3)
    expect(editPage).toContain('allowNextNavigation()\n    await navigateTo(\'/_desk/pages\')')
  })
})
