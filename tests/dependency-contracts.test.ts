import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { AuthHandler } from 'next-auth/core'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

async function readProjectFiles() {
  const [packageText, lockfile, authPatch, nuxtConfig] = await Promise.all([
    readFile(resolve(projectRoot, 'package.json'), 'utf8'),
    readFile(resolve(projectRoot, 'pnpm-lock.yaml'), 'utf8'),
    readFile(resolve(projectRoot, 'patches/next-auth@4.24.14.patch'), 'utf8'),
    readFile(resolve(projectRoot, 'nuxt.config.ts'), 'utf8')
  ])

  return {
    packageJson: JSON.parse(packageText),
    lockfile,
    authPatch,
    nuxtConfig
  }
}

describe('dependency security contracts', () => {
  it('keeps the patched Sidebase Auth.js bridge exact and removes the Next.js peer tree', async () => {
    const { packageJson, lockfile, authPatch } = await readProjectFiles()

    expect(packageJson.dependencies['@sidebase/nuxt-auth']).toBe('1.3.1')
    expect(packageJson.dependencies['next-auth']).toBe('4.24.14')
    expect(packageJson.pnpm.patchedDependencies['next-auth@4.24.14']).toBe('patches/next-auth@4.24.14.patch')
    expect(packageJson.pnpm.peerDependencyRules.allowedVersions).toEqual({
      '@sidebase/nuxt-auth@1.3.1>next-auth': '4.24.14'
    })
    expect(packageJson.pnpm.overrides).toMatchObject({
      'next-auth@4.24.14>next': '-',
      'next-auth@4.24.14>react': '-',
      'next-auth@4.24.14>react-dom': '-'
    })
    expect(authPatch).toContain('"./core"')
    expect(AuthHandler).toBeTypeOf('function')
    expect(lockfile).not.toMatch(/^ {2}next@/m)
    expect(lockfile).not.toMatch(/next-auth@4\.24\.14[^\n]*\(next@/)
  })

  it('keeps every Tiptap package on its aligned release line', async () => {
    const { packageJson, lockfile } = await readProjectFiles()
    const directEntries = Object.entries(packageJson.dependencies as Record<string, string>)
      .filter(([name]) => name.startsWith('@tiptap/'))
    const ordinaryDirectVersions = new Set(
      directEntries.filter(([name]) => name !== '@tiptap/y-tiptap').map(([, version]) => version)
    )

    expect([...ordinaryDirectVersions]).toEqual(['3.27.3'])
    expect(packageJson.dependencies['@tiptap/y-tiptap']).toBe('3.0.6')

    const overrideEntries = Object.entries(packageJson.pnpm.overrides as Record<string, string>)
      .filter(([name]) => name.startsWith('@tiptap/'))
    expect(overrideEntries.filter(([name]) => name !== '@tiptap/y-tiptap').every(([, version]) => version === '3.27.3')).toBe(true)
    expect(packageJson.pnpm.overrides['@tiptap/y-tiptap']).toBe('3.0.6')
    expect(lockfile).not.toMatch(/^ {2}'@tiptap\/[^']+@3\.18\.0/m)
    expect(lockfile).not.toMatch(/^ {2}(markdown-it|linkify-it)@/m)
  })

  it('preserves Nuxt runtimeConfig environment handling', async () => {
    const { nuxtConfig } = await readProjectFiles()

    expect(nuxtConfig).toContain('originEnvKey: \'NUXT_AUTH_ORIGIN\'')
    expect(nuxtConfig).not.toContain('process.env.AUTH_ORIGIN')
    expect(nuxtConfig).not.toContain('process.env.NUXT_AUTH_ORIGIN')
    expect(nuxtConfig).not.toContain('process.env.NUXT_AUTH_SECRET')
  })
})
