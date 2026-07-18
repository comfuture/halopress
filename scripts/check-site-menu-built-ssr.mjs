#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'

const projectRoot = resolve(import.meta.dirname, '..')
const wranglerConfig = join(projectRoot, 'wrangler.jsonc')
const workerEntry = join(projectRoot, '.output/server/index.mjs')
const publicAssets = join(projectRoot, '.output/public')
const packageManager = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const readyTimeoutMs = 30_000
const authSecret = 'halopress-built-ssr-smoke-secret'

function sqlString(value) {
  return `'${String(value).replaceAll('\'', '\'\'')}'`
}

function persistedTheme(colorMode) {
  return {
    version: 1,
    colorMode,
    colors: {
      light: {
        primary: '#ad46ff', secondary: '#2b7fff', neutral: '#71717b',
        background: '#ffffff', text: '#3f3f46', success: '#00c16a',
        info: '#2b7fff', warning: '#f0b100', error: '#fb2c36'
      },
      dark: {
        primary: '#c27aff', secondary: '#51a2ff', neutral: '#9f9fa9',
        background: '#18181b', text: '#e4e4e7', success: '#00dc82',
        info: '#51a2ff', warning: '#fdc700', error: '#ff6467'
      }
    },
    radii: { control: 0.25, sm: 0.25, md: 0.375, lg: 0.5 },
    typography: {
      bodyFontFamily: 'public-sans',
      headingFontFamily: 'public-sans',
      fontSizeBase: 1,
      lineHeightBody: 1.6,
      lineHeightHeading: 1.15
    },
    spacing: { block: 1.25, inline: 0.75 },
    content: { maxWidth: 72, textWidth: 48 }
  }
}

function persistedActiveTheme(colorMode) {
  return JSON.stringify({
    version: 1,
    bootstrapOwned: false,
    bootstrapSourceUpdatedAt: null,
    bootstrapSourceRevision: null,
    bootstrapSourceIdentity: null,
    mutationToken: null,
    theme: persistedTheme(colorMode)
  })
}

async function runWrangler(args, stateDirectory) {
  const result = await new Promise((resolveResult, reject) => {
    const child = spawn(packageManager, ['exec', 'wrangler', ...args], {
      cwd: projectRoot,
      env: {
        ...process.env,
        CI: '1',
        HALOPRESS_SKIP_WRANGLER_BUILD: '1'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.once('error', reject)
    child.once('close', code => resolveResult({ code: code ?? 1, stdout, stderr }))
  })

  if (result.code !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
    throw new Error(`Wrangler ${args[0]} failed for ${stateDirectory}:\n${details}`)
  }
  return result
}

async function reservePort() {
  const server = createServer()
  await new Promise((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolveListen)
  })
  const address = server.address()
  assert.ok(address && typeof address !== 'string', 'Could not reserve a local port')
  const port = address.port
  await new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()))
  return port
}

async function waitForWorker(child, logs) {
  await new Promise((resolveReady, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Wrangler did not become ready within ${readyTimeoutMs}ms:\n${logs.text}`))
    }, readyTimeoutMs)
    const onData = (chunk) => {
      logs.text += chunk
      if (!/Ready on http:\/\//.test(logs.text)) return
      clearTimeout(timeout)
      resolveReady()
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.once('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.once('close', (code) => {
      clearTimeout(timeout)
      reject(new Error(`Wrangler exited before becoming ready (${code ?? 1}):\n${logs.text}`))
    })
  })
}

async function stopWorker(child) {
  if (child.exitCode !== null || child.signalCode !== null) return

  const close = new Promise(resolveClose => child.once('close', resolveClose))
  try {
    if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGTERM')
    else child.kill('SIGTERM')
  } catch {
    // The process may have exited between the state check and the signal.
  }
  const stopped = await Promise.race([
    close.then(() => true),
    new Promise(resolveTimeout => setTimeout(() => resolveTimeout(false), 5_000))
  ])
  if (stopped) return

  try {
    if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL')
    else child.kill('SIGKILL')
  } catch {
    // The process exited while the timeout elapsed.
  }
  await close
}

function seedSql() {
  const document = JSON.stringify({
    version: 1,
    items: [{
      id: 'ssr-parent',
      label: 'Built SSR Parent',
      destination: {
        type: 'external',
        url: 'https://example.com/built-ssr-parent',
        newWindow: false
      },
      value: 'built-ssr-parent',
      children: [{
        id: 'ssr-home-child',
        label: 'Built SSR Home Child',
        destination: { type: 'home' },
        value: 'built-ssr-home-child'
      }]
    }, {
      id: 'ssr-external',
      label: 'Built SSR External',
      destination: {
        type: 'external',
        url: 'https://example.com/built-ssr-external',
        newWindow: false
      },
      value: 'built-ssr-external',
      children: []
    }]
  })
  const pageDocument = JSON.stringify({
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [{ type: 'text', text: 'Built portable Theme delivery' }]
    }]
  })

  return `
INSERT INTO installation (
  key, state, owner, setup_session_hash, setup_session_expires_at,
  lease_token, lease_expires_at, completed_at, updated_at, last_error
) VALUES (
  'singleton', 'complete', 'test:built-ssr', NULL, NULL,
  NULL, NULL, unixepoch(), unixepoch(), NULL
) ON CONFLICT(key) DO UPDATE SET
  state = 'complete', owner = 'test:built-ssr', completed_at = unixepoch(),
  updated_at = unixepoch(), last_error = NULL;

INSERT INTO settings (
  scope, key, value, value_type, is_encrypted, group_key,
  updated_by, updated_at, note
) VALUES (
  'global', 'site.mode', '{"version":1,"enabled":true}', 'json', 0,
  'site.mode', 'test:built-ssr', unixepoch(), 'Enable Site Theme built SSR fixture'
);

INSERT INTO settings (
  scope, key, value, value_type, is_encrypted, group_key,
  updated_by, updated_at, note
) VALUES (
  'global', 'site.theme.active', ${sqlString(persistedActiveTheme('dark'))}, 'json', 0,
  'site.theme', 'test:built-ssr', unixepoch(), 'Persist dark Theme for SSR fixture'
);

INSERT INTO page (
  id, title, status, content_json, current_revision, published_revision_id,
  first_published_at, published_at, created_by, updated_by, created_at, updated_at
) VALUES (
  'built-theme-page', 'Built Theme Page', 'published', ${sqlString(pageDocument)}, 1,
  'built-theme-page-revision', unixepoch(), unixepoch(),
  'test:built-ssr', 'test:built-ssr', unixepoch(), unixepoch()
);

INSERT INTO publication_revision (
  id, document_kind, document_id, title, content_json, created_by, created_at
) VALUES (
  'built-theme-page-revision', 'page', 'built-theme-page', 'Built Theme Page',
  ${sqlString(pageDocument)}, 'test:built-ssr', unixepoch()
);

INSERT INTO public_route (
  path, route_kind, document_kind, document_id, schema_key, seo_json,
  created_at, updated_at
) VALUES (
  '/built-theme-page', 'canonical', 'page', 'built-theme-page', NULL, NULL,
  unixepoch(), unixepoch()
);

INSERT INTO site_menu_set (
  id, name, name_key, document_json, bootstrap_owned,
  bootstrap_source_updated_at, created_by, updated_by, created_at, updated_at
) VALUES (
  'global-navigation', 'Global navigation', 'global navigation', ${sqlString(document)}, 0,
  NULL, 'test:built-ssr', 'test:built-ssr', unixepoch(), unixepoch()
);

INSERT INTO site_menu_reference (
  owner_type, owner_id, slot, menu_set_id, label, created_at, updated_at
) VALUES (
  'public-site-shell', 'default-public-site', 'global-navigation',
  'global-navigation', 'Built-in public Site navigation', unixepoch(), unixepoch()
);
`.trim()
}

async function assertThemeDelivery(origin, stateDirectory, stateArgs) {
  const manifestResponse = await fetch(`${origin}/api/delivery/site-theme`)
  assert.equal(manifestResponse.status, 200, 'Expected the public Theme manifest')
  assert.equal(manifestResponse.headers.get('cache-control'), 'public, max-age=0, must-revalidate')
  assert.equal(manifestResponse.headers.get('access-control-allow-origin'), '*')
  assert.equal(manifestResponse.headers.get('cross-origin-resource-policy'), 'cross-origin')
  assert.equal(manifestResponse.headers.get('x-content-type-options'), 'nosniff')
  const manifestEtag = manifestResponse.headers.get('etag')
  assert.ok(manifestEtag, 'Expected a strong Theme manifest ETag')
  const manifest = await manifestResponse.json()
  assert.equal(manifest.contractVersion, 1)
  assert.equal(manifest.siteModeEnabled, true)
  assert.equal(manifest.colorMode, 'dark')
  assert.match(manifest.revision, /^[0-9a-f]{64}$/)
  assert.match(manifest.stylesheetRevision, /^[0-9a-f]{64}$/)
  assert.equal(manifest.stylesheetUrl, `${origin}/_halo/theme/v1/${manifest.stylesheetRevision}.css`)

  const manifest304 = await fetch(`${origin}/api/delivery/site-theme`, {
    headers: { 'If-None-Match': manifestEtag }
  })
  assert.equal(manifest304.status, 304, 'Expected Theme manifest conditional revalidation')

  const cssResponse = await fetch(manifest.stylesheetUrl)
  const cssResponseBody = await cssResponse.clone().text()
  const artifactDebug = cssResponse.status === 200
    ? ''
    : (await runWrangler([
        'd1', 'execute', 'DB',
        '--command', 'SELECT key, value_type, is_encrypted, length(value) AS value_length FROM settings WHERE key LIKE \'site.theme.artifact.%\'',
        ...stateArgs
      ], stateDirectory)).stdout
  assert.equal(
    cssResponse.status,
    200,
    `Expected the immutable Theme CSS at ${manifest.stylesheetUrl}: ${cssResponseBody}\n${artifactDebug}`
  )
  assert.match(cssResponse.headers.get('content-type') ?? '', /^text\/css/)
  assert.equal(cssResponse.headers.get('cache-control'), 'public, max-age=31536000, immutable')
  assert.equal(cssResponse.headers.get('access-control-allow-origin'), '*')
  const cssEtag = cssResponse.headers.get('etag')
  const css = await cssResponse.text()
  assert.ok(css.includes('--halo-color-primary'), 'Expected canonical Halo Theme variables')
  assert.ok(!css.includes('--ui-'), 'Public Theme CSS must not contain Nuxt UI variables')
  const css304 = await fetch(manifest.stylesheetUrl, { headers: { 'If-None-Match': cssEtag } })
  assert.equal(css304.status, 304, 'Expected Theme CSS conditional revalidation')

  for (const path of [
    `/_halo/theme/v1/${'f'.repeat(64)}.css`,
    '/_halo/theme/v1/not-a-digest.css'
  ]) {
    const missingCss = await fetch(`${origin}${path}`)
    assert.equal(missingCss.status, 404, `Expected a Theme CSS miss for ${path}`)
    assert.equal(missingCss.headers.get('cache-control'), 'no-store')
  }

  const pageResponse = await fetch(`${origin}/api/delivery/page/built-theme-page`)
  assert.equal(pageResponse.status, 200, 'Expected the built portable Page envelope')
  const page = await pageResponse.json()
  assert.equal(page.rendering.themeRevision, manifest.revision)
  assert.deepEqual(page.rendering.stylesheets, [
    `${origin}/_halo/content/v1/dfea71d319d9c7d0a48d19346c115d3bd32a51e0b88f30e4c344cb454b9ea3f1.css`,
    manifest.stylesheetUrl
  ])
  assert.ok(page.rendering.html.includes('Built portable Theme delivery'))
  assert.ok(page.rendering.html.includes('data-halo-color-mode="dark"'))
  return manifest
}

async function setPersistedThemeMode(stateDirectory, stateArgs, colorMode) {
  const value = sqlString(persistedActiveTheme(colorMode))
  await runWrangler([
    'd1', 'execute', 'DB',
    '--command', `UPDATE settings SET value = ${value}, updated_at = unixepoch() WHERE scope = 'global' AND key = 'site.theme.active'`,
    ...stateArgs
  ], stateDirectory)
}

async function assertBuiltPageMode(origin, expectedMode) {
  const response = await fetch(`${origin}/built-theme-page`)
  const html = await response.text()
  assert.equal(response.status, 200, `Expected built Page SSR for ${expectedMode}, received ${response.status}`)
  assert.ok(
    html.includes(`data-halo-color-mode="${expectedMode}"`)
    || html.includes(`data-halo-color-mode=&quot;${expectedMode}&quot;`),
    `Expected built Page SSR to serialize the ${expectedMode} portable root mode`
  )
  const modeAttribute = `data-halo-color-mode="${expectedMode}"`
  assert.match(
    html,
    new RegExp(`<body(?=[^>]*data-halo-theme-enabled="true")(?=[^>]*${modeAttribute})[^>]*>`),
    `Expected built SSR body to serialize the ${expectedMode} Site Theme mode`
  )
  assert.match(
    html,
    new RegExp(`<div(?=[^>]*class="site-shell")(?=[^>]*${modeAttribute})[^>]*>`),
    `Expected built SSR shell to serialize the ${expectedMode} Site Theme mode`
  )
  return html
}

async function assertCompiledSiteThemeAdapter(origin, html) {
  const hrefs = [...html.matchAll(/<link[^>]+href="([^"]+\.css)"/g)].map(match => match[1])
  const stylesheets = await Promise.all(hrefs.map(async href => fetch(new URL(href, origin)).then(response => response.text())))
  const css = stylesheets.join('\n')
  assert.match(
    css,
    /body\.site-theme-adapter\[data-halo-theme-enabled=(?:true|"true")\]\[data-halo-color-mode=(?:dark|"dark")\]/,
    'Expected the compiled app adapter to contain an explicit dark body selector'
  )
  assert.match(
    css,
    /@media\(prefers-color-scheme:dark\)[\s\S]*data-halo-color-mode=(?:default|"default")/,
    'Expected the built app adapter to retain the system dark media selector'
  )
  assert.ok(
    css.includes('--halo-site-color-primary:var(--halo-color-primary-dark)'),
    'Expected the built dark adapter to map the actual Halo primary token path'
  )
  assert.ok(
    css.includes('--ui-text-inverted:var(--halo-site-color-on-warning)'),
    'Expected the built adapter to use the warning-specific solid foreground'
  )
}

function assertRenderedMenu(html) {
  const horizontalRoot = /<[^>]+(?=[^>]*data-slot="root")(?=[^>]*data-orientation="horizontal")[^>]*>/
  assert.ok(horizontalRoot.test(html), 'Expected real horizontal Nuxt UI navigation SSR markup')
  assert.ok(html.includes('data-menu-item'), 'Expected Nuxt UI menu item SSR markers')
  assert.ok(
    html.includes('href="https://example.com/built-ssr-external"'),
    'Expected the seeded external target in rendered navigation markup'
  )

  const externalLabels = html.match(/data-slot="linkLabel"[^>]*>[\s\S]{0,400}?Built SSR External/g) ?? []
  assert.ok(
    externalLabels.length >= 1,
    'Expected the seeded external label in horizontal Nuxt UI navigation'
  )
  assert.ok(
    /data-slot="linkLabel"[^>]*>[\s\S]{0,400}?Built SSR Parent/.test(html),
    'Expected the child-bearing parent label in horizontal Nuxt UI navigation'
  )
  assert.ok(
    /<button(?=[^>]*data-navigation-menu-trigger)(?=[^>]*aria-expanded="false")[^>]*>[\s\S]{0,800}?Built SSR Parent/.test(html),
    'Expected the child-bearing item to SSR as a closed horizontal Nuxt UI trigger'
  )
}

function assertRenderedNuxtFixture(html) {
  const horizontalStart = html.indexOf('<section data-site-menu-horizontal-fixture')
  const horizontalEnd = html.indexOf('</section>', horizontalStart)
  assert.ok(horizontalStart >= 0 && horizontalEnd > horizontalStart, 'Expected the build-only horizontal Site menu fixture')
  const horizontalFixture = html.slice(horizontalStart, horizontalEnd + '</section>'.length)

  assert.ok(horizontalFixture.includes('data-parent-value="built-ssr-parent"'), 'Expected the stable horizontal parent value')
  assert.ok(horizontalFixture.includes('data-child-value="built-ssr-home-child"'), 'Expected the stable horizontal child value')
  const horizontalRoot = /<[^>]+(?=[^>]*data-slot="root")(?=[^>]*data-orientation="horizontal")[^>]*>/
  assert.ok(horizontalRoot.test(horizontalFixture), 'Expected real horizontal Nuxt UI fixture markup')
  assert.ok(
    /<button(?=[^>]*data-navigation-menu-trigger)(?=[^>]*aria-expanded="true")(?=[^>]*data-state="open")(?=[^>]*site-menu-horizontal-fixture-link)[^>]*>[\s\S]{0,800}?Built SSR Parent/.test(horizontalFixture),
    'Expected Nuxt UI defaultValue to SSR the horizontal parent trigger open'
  )
  const childMarker = 'site-menu-horizontal-fixture-child-link'
  // Prefer the fixture section when the renderer keeps content inline. Reka
  // portals NavigationMenuContent outside that section in the current SSR
  // build, so the fallback is bound to this fixture by a unique Nuxt UI
  // childLink class rather than by a label shared with the public layout.
  const horizontalContent = horizontalFixture.includes(childMarker) ? horizontalFixture : html
  if (horizontalContent === html) {
    assert.ok(html.includes(childMarker), 'Expected fixture-owned teleported horizontal child content')
  }
  assert.ok(
    /<a(?=[^>]*href="\/")(?=[^>]*data-slot="childLink")(?=[^>]*site-menu-horizontal-fixture-child-link)[^>]*>[\s\S]{0,1200}?Built SSR Home Child/.test(horizontalContent),
    'Expected the fixture-owned child link in open teleported horizontal Nuxt UI content'
  )

  const start = html.indexOf('<section data-site-menu-vertical-fixture')
  const end = html.indexOf('</section>', start)
  assert.ok(start >= 0 && end > start, 'Expected the build-only vertical Site menu fixture')
  const fixture = html.slice(start, end + '</section>'.length)

  assert.ok(fixture.includes('data-parent-value="built-ssr-parent"'), 'Expected the stable parent value')
  assert.ok(fixture.includes('data-child-value="built-ssr-home-child"'), 'Expected the stable child value')
  assert.ok(fixture.includes('data-parent-open="true"'), 'Expected the adapter to request the active parent open')

  const verticalRoot = /<[^>]+(?=[^>]*data-slot="root")(?=[^>]*data-orientation="vertical")[^>]*>/
  assert.ok(verticalRoot.test(fixture), 'Expected real vertical Nuxt UI navigation SSR markup')
  assert.ok(
    /<button(?=[^>]*aria-expanded="true")(?=[^>]*data-state="open")[^>]*>[\s\S]{0,800}?Built SSR Parent/.test(fixture),
    'Expected Nuxt UI to SSR the active vertical Accordion parent open'
  )
  assert.ok(
    !fixture.includes('href="https://example.com/built-ssr-parent"'),
    'Expected a child-bearing vertical item to remain a trigger instead of rendering its saved parent target'
  )
  assert.ok(
    /<a(?=[^>]*href="\/")(?=[^>]*data-slot="link")[^>]*>[\s\S]{0,800}?Built SSR Home Child/.test(fixture),
    'Expected the active child link inside the open vertical Accordion'
  )
}

async function main() {
  await Promise.all([access(workerEntry), access(publicAssets)])
  const stateDirectory = await mkdtemp(join(tmpdir(), 'halopress-site-menu-built-ssr-'))
  let worker = null
  try {
    const stateArgs = ['--local', '--persist-to', stateDirectory, '--config', wranglerConfig]
    await runWrangler(['d1', 'migrations', 'apply', 'DB', ...stateArgs], stateDirectory)
    await runWrangler(['d1', 'execute', 'DB', '--command', seedSql(), ...stateArgs], stateDirectory)

    const port = await reservePort()
    const origin = `http://127.0.0.1:${port}`
    const logs = { text: '' }
    worker = spawn(packageManager, [
      'exec', 'wrangler', 'dev', workerEntry,
      '--assets', publicAssets,
      '--ip', '127.0.0.1',
      '--port', String(port),
      '--persist-to', stateDirectory,
      '--config', wranglerConfig,
      '--var', `NUXT_AUTH_SECRET:${authSecret}`,
      '--var', `NUXT_CANONICAL_ORIGIN:${origin}`
    ], {
      cwd: projectRoot,
      detached: process.platform !== 'win32',
      env: {
        ...process.env,
        CI: '1',
        HALOPRESS_SKIP_WRANGLER_BUILD: '1'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    await waitForWorker(worker, logs)

    const themeManifest = await assertThemeDelivery(origin, stateDirectory, stateArgs)

    const response = await fetch(`${origin}/`)
    const html = await response.text()
    assert.equal(response.status, 200, `Expected public route SSR to succeed, received ${response.status}`)
    assert.equal(response.headers.get('x-powered-by'), 'Nuxt')
    assertRenderedMenu(html)
    assert.ok(html.includes('data-halo-theme-enabled="true"'), 'Expected anonymous SSR to enable the Theme shell adapter')
    const baseHref = '/_halo/content/v1/dfea71d319d9c7d0a48d19346c115d3bd32a51e0b88f30e4c344cb454b9ea3f1.css'
    const themeHref = new URL(themeManifest.stylesheetUrl).pathname
    assert.ok(html.includes(baseHref), 'Expected anonymous SSR to load the portable base CSS')
    assert.ok(html.includes(themeHref), 'Expected anonymous SSR to load the exact Theme digest CSS')
    assert.ok(html.lastIndexOf(baseHref) < html.lastIndexOf(themeHref), 'Expected base CSS before the final Theme CSS link')
    assert.ok(!html.slice(html.lastIndexOf(themeHref)).includes(baseHref), 'No base CSS link may occur after the final Theme link')
    assert.ok(html.includes('data-halo-color-mode="dark"'), 'Expected the saved dark Theme mode in anonymous shell SSR')
    assert.ok(html.includes('--ui-primary:var(--halo-site-color-primary'), 'Expected the live Halo to Nuxt UI adapter path')
    await assertCompiledSiteThemeAdapter(origin, html)

    await assertBuiltPageMode(origin, 'dark')
    await setPersistedThemeMode(stateDirectory, stateArgs, 'light')
    await assertBuiltPageMode(origin, 'light')
    await setPersistedThemeMode(stateDirectory, stateArgs, 'system')
    await assertBuiltPageMode(origin, 'default')

    const verticalResponse = await fetch(`http://127.0.0.1:${port}/_site-menu-ssr-fixture`)
    const verticalHtml = await verticalResponse.text()
    assert.equal(verticalResponse.status, 200, `Expected vertical fixture SSR to succeed, received ${verticalResponse.status}`)
    assertRenderedNuxtFixture(verticalHtml)
    console.log('Built Site/Theme SSR smoke passed: anonymous manifest, immutable CSS, portable Page, dark/light/system root modes, ordered shell links, and Nuxt menus rendered correctly.')
  } finally {
    if (worker) await stopWorker(worker)
    await rm(stateDirectory, { recursive: true, force: true })
  }
}

try {
  await main()
} catch (error) {
  console.error(error instanceof Error ? error.stack || error.message : error)
  process.exitCode = 1
}
