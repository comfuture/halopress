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
    const logs = { text: '' }
    worker = spawn(packageManager, [
      'exec', 'wrangler', 'dev', workerEntry,
      '--assets', publicAssets,
      '--ip', '127.0.0.1',
      '--port', String(port),
      '--persist-to', stateDirectory,
      '--config', wranglerConfig,
      '--var', `NUXT_AUTH_SECRET:${authSecret}`
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

    const response = await fetch(`http://127.0.0.1:${port}/`)
    const html = await response.text()
    assert.equal(response.status, 200, `Expected public route SSR to succeed, received ${response.status}`)
    assert.equal(response.headers.get('x-powered-by'), 'Nuxt')
    assertRenderedMenu(html)

    const verticalResponse = await fetch(`http://127.0.0.1:${port}/_site-menu-ssr-fixture`)
    const verticalHtml = await verticalResponse.text()
    assert.equal(verticalResponse.status, 200, `Expected vertical fixture SSR to succeed, received ${verticalResponse.status}`)
    assertRenderedNuxtFixture(verticalHtml)
    console.log('Built Site menu SSR smoke passed: Nuxt rendered public and open horizontal navigation plus an open vertical Accordion.')
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
