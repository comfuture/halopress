import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { SETTINGS_SECTIONS } from '../shared/settings-sections'

describe('Settings hub', () => {
  it('reserves stable typed routes for every owned settings area', () => {
    expect(SETTINGS_SECTIONS.map(section => section.id)).toEqual([
      'overview',
      'site',
      'appearance',
      'navigation',
      'footer',
      'authentication',
      'membership',
      'publishing',
      'integrations',
      'operations'
    ])
    expect(new Set(SETTINGS_SECTIONS.map(section => section.to)).size).toBe(SETTINGS_SECTIONS.length)
  })

  it('links the Desk and authentication screen through the shared settings shell', async () => {
    const root = resolve(import.meta.dirname, '..')
    const [deskLayout, settingsIndex, authentication, shell] = await Promise.all([
      readFile(resolve(root, 'app/layouts/desk.vue'), 'utf8'),
      readFile(resolve(root, 'app/pages/_desk/settings/index.vue'), 'utf8'),
      readFile(resolve(root, 'app/pages/_desk/settings/authentication.vue'), 'utf8'),
      readFile(resolve(root, 'app/components/SettingsShell.vue'), 'utf8')
    ])

    expect(deskLayout).toContain('/_desk/settings')
    expect(settingsIndex).not.toContain('navigateTo(')
    expect(authentication).toContain('<SettingsShell')
    expect(shell).toContain('Settings sections')
    expect(shell).toContain('orientation="horizontal"')
    expect(shell).toContain('orientation="vertical"')
  })
})
