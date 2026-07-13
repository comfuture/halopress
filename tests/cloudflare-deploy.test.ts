import { spawn } from 'node:child_process'
import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parse as parseJsonc } from 'jsonc-parser'
import { describe, expect, it } from 'vitest'

const projectRoot = resolve(import.meta.dirname, '..')
const prepareScript = join(projectRoot, 'scripts/prepare-cloudflare-d1.mjs')
const deployScript = join(projectRoot, 'scripts/deploy-cloudflare.sh')

type RunResult = { code: number, stdout: string, stderr: string }

async function run(command: string, args: string[], options: { cwd: string, env?: NodeJS.ProcessEnv }): Promise<RunResult> {
  return await new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
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
    child.once('close', code => resolveRun({ code: code ?? 1, stdout, stderr }))
  })
}

async function createFixture(config: Record<string, unknown>) {
  const directory = await mkdtemp(join(tmpdir(), 'halopress-cloudflare-deploy-'))
  const configPath = join(directory, 'wrangler.jsonc')
  const logPath = join(directory, 'wrangler-calls.jsonl')
  const listCountPath = join(directory, 'list-count')
  const secretMetaPath = join(directory, 'secret-meta.json')
  const mockPath = join(directory, 'wrangler-mock.mjs')
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`)
  await writeFile(mockPath, `#!/usr/bin/env node
import { appendFileSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
appendFileSync(process.env.MOCK_LOG, JSON.stringify(args) + '\\n')

if (args[0] === 'secret' && args[1] === 'list') {
  if (process.env.MOCK_SECRET_LIST_ERROR === 'new-worker') {
    const tick = String.fromCharCode(96)
    console.error('Worker "halopress-test" not found.\\nIf this is a new Worker, run ' + tick + 'wrangler deploy' + tick + ' first to create it.')
    process.exit(1)
  }
  if (process.env.MOCK_SECRET_LIST_ERROR) {
    console.error(process.env.MOCK_SECRET_LIST_ERROR)
    process.exit(1)
  }
  console.log(process.env.MOCK_SECRET_LIST_JSON || JSON.stringify([
    { name: 'NUXT_AUTH_SECRET', type: 'secret_text' }
  ]))
  process.exit(0)
}

if (args[0] === 'd1' && args[1] === 'list') {
  const countPath = process.env.MOCK_LIST_COUNT
  const count = existsSync(countPath) ? Number(readFileSync(countPath, 'utf8')) : 0
  writeFileSync(countPath, String(count + 1))
  const sequence = JSON.parse(process.env.MOCK_D1_LIST_SEQUENCE || '[[]]')
  console.log(JSON.stringify(sequence[Math.min(count, sequence.length - 1)]))
  process.exit(0)
}

if (args[0] === 'd1' && args[1] === 'create') {
  if (process.env.MOCK_CREATE_FAIL === '1') {
    console.error('A database with that name already exists')
    process.exit(1)
  }
  if (process.env.MOCK_CREATE_PATCH_ID) {
    const configIndex = args.indexOf('--config')
    const envIndex = args.indexOf('--env')
    const bindingIndex = args.indexOf('--binding')
    const configPath = args[configIndex + 1]
    const config = JSON.parse(readFileSync(configPath, 'utf8'))
    const scope = envIndex >= 0 ? config.env[args[envIndex + 1]] : config
    scope.d1_databases.push({
      binding: args[bindingIndex + 1],
      database_name: args[2],
      database_id: process.env.MOCK_CREATE_PATCH_ID
    })
    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\\n')
  }
  console.log('Successfully created D1 database')
  process.exit(0)
}

if (args[0] === 'd1' && args[1] === 'migrations' && args[2] === 'apply') {
  if (process.env.MOCK_MIGRATION_FAIL === '1') {
    console.error('mock migration failure')
    process.exit(1)
  }
  console.log('Migrations applied')
  process.exit(0)
}

if (args[0] === 'deploy') {
  const separatedIndex = args.indexOf('--secrets-file')
  const equalsArgument = args.find(argument => argument.startsWith('--secrets-file='))
  const secretsFile = separatedIndex >= 0 ? args[separatedIndex + 1] : equalsArgument?.slice('--secrets-file='.length)
  if (secretsFile && process.env.MOCK_SECRET_META) {
    const contents = readFileSync(secretsFile, 'utf8')
    let authSecret
    if (contents.trimStart().startsWith('{')) {
      authSecret = JSON.parse(contents).NUXT_AUTH_SECRET
    } else {
      const matches = [...contents.matchAll(/^NUXT_AUTH_SECRET=(.*)$/gm)]
      authSecret = matches.at(-1)?.[1]
    }
    writeFileSync(process.env.MOCK_SECRET_META, JSON.stringify({
      path: secretsFile,
      mode: statSync(secretsFile).mode & 0o777,
      authSecretCount: (contents.match(/^NUXT_AUTH_SECRET=/gm) || []).length,
      authSecretLength: typeof authSecret === 'string' ? authSecret.length : 0
    }))
  }
  if (process.env.MOCK_DEPLOY_FAIL === '1') {
    console.error('mock deploy failure')
    process.exit(1)
  }
  console.log('Worker deployed')
  process.exit(0)
}

console.error('Unexpected Wrangler arguments: ' + args.join(' '))
process.exit(2)
`)
  await chmod(mockPath, 0o755)

  return {
    directory,
    configPath,
    logPath,
    secretMetaPath,
    env: {
      HALOPRESS_WRANGLER_BIN: mockPath,
      MOCK_LOG: logPath,
      MOCK_LIST_COUNT: listCountPath,
      MOCK_SECRET_META: secretMetaPath
    }
  }
}

async function readCalls(logPath: string) {
  const contents = await readFile(logPath, 'utf8').catch(() => '')
  return contents.trim() ? contents.trim().split('\n').map(line => JSON.parse(line) as string[]) : []
}

function baseConfig(database: Record<string, unknown>) {
  return {
    name: 'halopress-test',
    main: 'worker.mjs',
    compatibility_date: '2026-05-18',
    d1_databases: [{ binding: 'DB', database_name: 'halopress-test', migrations_dir: 'migrations', ...database }]
  }
}

describe('Cloudflare deployment preparation', () => {
  it('rejects TOML configuration before making remote changes', async () => {
    const fixture = await createFixture(baseConfig({}))
    const tomlPath = join(fixture.directory, 'wrangler.toml')
    await writeFile(tomlPath, `name = "halopress-test"
main = "worker.mjs"
compatibility_date = "2026-05-18"

[[d1_databases]]
binding = "DB"
database_name = "halopress-test"
migrations_dir = "migrations"
`)

    const result = await run(process.execPath, [prepareScript, '--config', tomlPath], {
      cwd: projectRoot,
      env: fixture.env
    })

    expect(result.code).not.toBe(0)
    expect(result.stderr).toContain('supports JSON or JSONC only')
    expect(result.stderr).toContain('convert this file to wrangler.jsonc')
    expect(await readCalls(fixture.logPath)).toEqual([])
  })

  it('applies migrations directly when database_id is already configured', async () => {
    const fixture = await createFixture(baseConfig({ database_id: 'existing-id' }))
    const result = await run(process.execPath, [prepareScript, '--config', fixture.configPath], {
      cwd: projectRoot,
      env: fixture.env
    })

    expect(result).toMatchObject({ code: 0 })
    expect(await readCalls(fixture.logPath)).toEqual([
      ['d1', 'migrations', 'apply', 'DB', '--remote', '--config', fixture.configPath]
    ])
  })

  it('adopts an existing same-name D1 database before applying migrations', async () => {
    const fixture = await createFixture(baseConfig({}))
    const result = await run(process.execPath, [prepareScript, '--config', fixture.configPath], {
      cwd: projectRoot,
      env: {
        ...fixture.env,
        MOCK_D1_LIST_SEQUENCE: JSON.stringify([[{ name: 'halopress-test', uuid: 'adopted-id' }]])
      }
    })

    expect(result).toMatchObject({ code: 0 })
    expect(await readCalls(fixture.logPath)).toEqual([
      ['d1', 'list', '--json', '--config', fixture.configPath],
      ['d1', 'migrations', 'apply', 'DB', '--remote', '--config', fixture.configPath]
    ])
    expect(JSON.parse(await readFile(fixture.configPath, 'utf8')).d1_databases[0].database_id).toBe('adopted-id')
  })

  it('creates a missing D1 database, records its ID, and then migrates it', async () => {
    const fixture = await createFixture(baseConfig({}))
    const result = await run(process.execPath, [prepareScript, '--config', fixture.configPath], {
      cwd: projectRoot,
      env: {
        ...fixture.env,
        MOCK_CREATE_PATCH_ID: 'created-id',
        MOCK_D1_LIST_SEQUENCE: JSON.stringify([[]])
      }
    })

    expect(result).toMatchObject({ code: 0 })
    const calls = await readCalls(fixture.logPath)
    expect(calls).toHaveLength(3)
    expect(calls[1]).toEqual([
      'd1', 'create', 'halopress-test', '--binding', 'DB', '--update-config', '--config', fixture.configPath
    ])
    expect(calls[2]).toEqual([
      'd1', 'migrations', 'apply', 'DB', '--remote', '--config', fixture.configPath
    ])
    const patched = JSON.parse(await readFile(fixture.configPath, 'utf8'))
    expect(patched.d1_databases).toHaveLength(1)
    expect(patched.d1_databases[0]).toMatchObject({
      binding: 'DB',
      database_name: 'halopress-test',
      database_id: 'created-id',
      migrations_dir: 'migrations'
    })
  })

  it('normalizes duplicate D1 bindings without discarding JSONC comments', async () => {
    const fixture = await createFixture(baseConfig({}))
    await writeFile(fixture.configPath, `{
  // Keep the deployment metadata readable for operators.
  "name": "halopress-test",
  "main": "worker.mjs",
  "compatibility_date": "2026-05-18",
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "halopress-test",
      "migrations_dir": "migrations",
    },
    {
      "binding": "DB",
      "database_name": "halopress-test",
      "database_id": "created-id",
    },
  ],
}\n`)

    const result = await run(process.execPath, [prepareScript, '--config', fixture.configPath], {
      cwd: projectRoot,
      env: fixture.env
    })

    expect(result).toMatchObject({ code: 0 })
    expect(await readCalls(fixture.logPath)).toEqual([
      ['d1', 'migrations', 'apply', 'DB', '--remote', '--config', fixture.configPath]
    ])

    const configText = await readFile(fixture.configPath, 'utf8')
    expect(configText).toContain('// Keep the deployment metadata readable for operators.')
    const config = JSON.parse(configText.replace(/\/\/.*$/gm, '').replace(/,\s*([}\]])/g, '$1'))
    expect(config.d1_databases).toEqual([{
      binding: 'DB',
      database_name: 'halopress-test',
      migrations_dir: 'migrations',
      database_id: 'created-id'
    }])
  })

  it('falls back to D1 list when create does not patch the config', async () => {
    const fixture = await createFixture(baseConfig({}))
    const result = await run(process.execPath, [prepareScript, '--config', fixture.configPath], {
      cwd: projectRoot,
      env: {
        ...fixture.env,
        MOCK_D1_LIST_SEQUENCE: JSON.stringify([
          [],
          [{ name: 'halopress-test', uuid: 'listed-created-id' }]
        ])
      }
    })

    expect(result).toMatchObject({ code: 0 })
    expect(await readCalls(fixture.logPath)).toHaveLength(4)
    expect(JSON.parse(await readFile(fixture.configPath, 'utf8')).d1_databases[0].database_id).toBe('listed-created-id')
  })

  it('does not deploy when migrations fail', async () => {
    const fixture = await createFixture(baseConfig({ database_id: 'existing-id' }))
    const result = await run('bash', [deployScript, '--config', fixture.configPath], {
      cwd: projectRoot,
      env: { ...fixture.env, MOCK_MIGRATION_FAIL: '1' }
    })

    expect(result.code).not.toBe(0)
    expect(await readCalls(fixture.logPath)).toEqual([
      ['secret', 'list', '--format', 'json', '--config', fixture.configPath],
      ['d1', 'migrations', 'apply', 'DB', '--remote', '--config', fixture.configPath]
    ])
  })

  it('preserves an existing auth secret without passing a secrets file', async () => {
    const fixture = await createFixture(baseConfig({ database_id: 'existing-id' }))
    const result = await run('bash', [deployScript, '--config', fixture.configPath], {
      cwd: projectRoot,
      env: fixture.env
    })

    expect(result).toMatchObject({ code: 0 })
    expect(result.stdout).not.toContain('Generated NUXT_AUTH_SECRET')
    expect(await readCalls(fixture.logPath)).toEqual([
      ['secret', 'list', '--format', 'json', '--config', fixture.configPath],
      ['d1', 'migrations', 'apply', 'DB', '--remote', '--config', fixture.configPath],
      ['deploy', '--config', fixture.configPath]
    ])
    await expect(readFile(fixture.secretMetaPath)).rejects.toThrow()
  })

  it('generates one mode-0600 auth secret for a new Worker without logging its value', async () => {
    const fixture = await createFixture(baseConfig({ database_id: 'existing-id' }))
    const result = await run('bash', [deployScript, '--config', fixture.configPath], {
      cwd: projectRoot,
      env: { ...fixture.env, MOCK_SECRET_LIST_ERROR: 'new-worker' }
    })

    expect(result).toMatchObject({ code: 0 })
    expect(result.stdout).toContain('Generated NUXT_AUTH_SECRET')
    expect(`${result.stdout}\n${result.stderr}`).not.toMatch(/NUXT_AUTH_SECRET=[0-9a-f]{64}/)

    const calls = await readCalls(fixture.logPath)
    expect(calls.slice(0, 2)).toEqual([
      ['secret', 'list', '--format', 'json', '--config', fixture.configPath],
      ['d1', 'migrations', 'apply', 'DB', '--remote', '--config', fixture.configPath]
    ])
    expect(calls[2]?.slice(0, 3)).toEqual(['deploy', '--config', fixture.configPath])
    expect(calls[2]?.filter(argument => argument === '--secrets-file')).toHaveLength(1)

    const secretMeta = JSON.parse(await readFile(fixture.secretMetaPath, 'utf8'))
    expect(secretMeta).toMatchObject({ mode: 0o600, authSecretCount: 1, authSecretLength: 64 })
    await expect(readFile(secretMeta.path)).rejects.toThrow()
  })

  it('fails closed on unknown secret-list errors before migrations', async () => {
    const fixture = await createFixture(baseConfig({ database_id: 'existing-id' }))
    const result = await run('bash', [deployScript, '--config', fixture.configPath], {
      cwd: projectRoot,
      env: { ...fixture.env, MOCK_SECRET_LIST_ERROR: 'Authentication failed: invalid API token' }
    })

    expect(result.code).not.toBe(0)
    expect(result.stderr).toContain('Authentication failed')
    expect(await readCalls(fixture.logPath)).toEqual([
      ['secret', 'list', '--format', 'json', '--config', fixture.configPath]
    ])
  })

  it('cleans generated secret files when deployment fails', async () => {
    const fixture = await createFixture(baseConfig({ database_id: 'existing-id' }))
    const result = await run('bash', [deployScript, '--config', fixture.configPath], {
      cwd: projectRoot,
      env: {
        ...fixture.env,
        MOCK_SECRET_LIST_JSON: '[]',
        MOCK_DEPLOY_FAIL: '1'
      }
    })

    expect(result.code).not.toBe(0)
    const secretMeta = JSON.parse(await readFile(fixture.secretMetaPath, 'utf8'))
    expect(secretMeta).toMatchObject({ mode: 0o600, authSecretCount: 1, authSecretLength: 64 })
    await expect(readFile(secretMeta.path)).rejects.toThrow()
  })

  it('accepts a 24-byte UTF-8 auth secret without adding a conflicting secrets file', async () => {
    const fixture = await createFixture(baseConfig({ database_id: 'existing-id' }))
    const userSecretsPath = join(fixture.directory, 'user-secrets.env')
    const providedSecret = '가나다라마바사아'
    await writeFile(userSecretsPath, `OPTIONAL_VALUE=test\nNUXT_AUTH_SECRET=${providedSecret}\n`)
    const result = await run('bash', [
      deployScript,
      '--config', fixture.configPath,
      '--secrets-file', userSecretsPath
    ], {
      cwd: projectRoot,
      env: { ...fixture.env, MOCK_SECRET_LIST_ERROR: 'new-worker' }
    })

    expect(result).toMatchObject({ code: 0 })
    expect(`${result.stdout}\n${result.stderr}`).not.toContain(providedSecret)
    const deployCall = (await readCalls(fixture.logPath)).at(-1)
    expect(deployCall?.filter(argument => argument === '--secrets-file')).toHaveLength(1)
    expect(deployCall).toContain(userSecretsPath)
    const secretMeta = JSON.parse(await readFile(fixture.secretMetaPath, 'utf8'))
    expect(secretMeta.path).toBe(userSecretsPath)
    expect(await readFile(userSecretsPath, 'utf8')).toContain('NUXT_AUTH_SECRET=')
  })

  it('rejects a supplied 20-byte auth secret before remote access or migrations', async () => {
    const fixture = await createFixture(baseConfig({ database_id: 'existing-id' }))
    const userSecretsPath = join(fixture.directory, 'weak-secrets.env')
    await writeFile(userSecretsPath, 'NUXT_AUTH_SECRET=user-selected-secret\n')
    const result = await run('bash', [
      deployScript,
      '--config', fixture.configPath,
      '--secrets-file', userSecretsPath
    ], {
      cwd: projectRoot,
      env: fixture.env
    })

    expect(result.code).not.toBe(0)
    expect(result.stderr).toContain('must be at least 24 UTF-8 bytes')
    expect(result.stderr).toContain('openssl rand -hex 32')
    expect(await readCalls(fixture.logPath)).toEqual([])
  })

  it('rejects a caller secrets file without the required first-deploy auth secret', async () => {
    const fixture = await createFixture(baseConfig({ database_id: 'existing-id' }))
    const userSecretsPath = join(fixture.directory, 'user-secrets.json')
    await writeFile(userSecretsPath, JSON.stringify({ OPTIONAL_VALUE: 'test' }))
    const result = await run('bash', [
      deployScript,
      '--config', fixture.configPath,
      '--secrets-file', userSecretsPath
    ], {
      cwd: projectRoot,
      env: { ...fixture.env, MOCK_SECRET_LIST_JSON: '[]' }
    })

    expect(result.code).not.toBe(0)
    expect(result.stderr).toContain('must contain NUXT_AUTH_SECRET with at least 24 UTF-8 bytes')
    expect(await readCalls(fixture.logPath)).toEqual([
      ['secret', 'list', '--format', 'json', '--config', fixture.configPath]
    ])
  })

  it('keeps dry-run free of remote provisioning and migration changes', async () => {
    const fixture = await createFixture(baseConfig({}))
    const result = await run('bash', [deployScript, '--config', fixture.configPath, '--dry-run'], {
      cwd: projectRoot,
      env: fixture.env
    })

    expect(result).toMatchObject({ code: 0 })
    expect(result.stdout).toContain('[dry-run]')
    expect(await readCalls(fixture.logPath)).toEqual([
      ['deploy', '--config', fixture.configPath, '--dry-run']
    ])
    expect(JSON.parse(await readFile(fixture.configPath, 'utf8')).d1_databases[0].database_id).toBeUndefined()
  })

  it('uses environment bindings and forwards config/env/name to the applicable commands', async () => {
    const fixture = await createFixture({
      name: 'halopress-test',
      main: 'worker.mjs',
      compatibility_date: '2026-05-18',
      env: {
        staging: {
          d1_databases: [{
            binding: 'DB',
            database_name: 'halopress-staging',
            migrations_dir: 'migrations'
          }]
        }
      }
    })
    const result = await run('bash', [
      deployScript,
      '--config', fixture.configPath,
      '--env', 'staging',
      '--name', 'halopress-staging-worker'
    ], {
      cwd: projectRoot,
      env: {
        ...fixture.env,
        MOCK_D1_LIST_SEQUENCE: JSON.stringify([[{ name: 'halopress-staging', uuid: 'staging-id' }]])
      }
    })

    expect(result).toMatchObject({ code: 0 })
    const common = ['--config', fixture.configPath, '--env', 'staging']
    expect(await readCalls(fixture.logPath)).toEqual([
      ['secret', 'list', '--format', 'json', ...common, '--name', 'halopress-staging-worker'],
      ['d1', 'list', '--json', ...common],
      ['d1', 'migrations', 'apply', 'DB', '--remote', ...common],
      ['deploy', ...common, '--name', 'halopress-staging-worker']
    ])
    const patched = JSON.parse(await readFile(fixture.configPath, 'utf8'))
    expect(patched.env.staging.d1_databases[0].database_id).toBe('staging-id')
  })

  it('exposes the custom deploy wrapper for Deploy Button detection', async () => {
    const packageJson = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8'))
    expect(packageJson.scripts.deploy).toBe('bash scripts/deploy-cloudflare.sh')
    expect(packageJson.scripts['db:d1:list']).toBe('wrangler d1 migrations list DB')
    expect(packageJson.scripts['db:d1:apply']).toBe('wrangler d1 migrations apply DB')
    expect(packageJson.scripts['db:d1:apply:local']).toBe('wrangler d1 migrations apply DB --local')
    expect(packageJson.scripts['db:d1:apply:remote']).toBe('wrangler d1 migrations apply DB --remote')
  })

  it('keeps the automatically managed auth secret out of one-click form metadata', async () => {
    const devVarsExample = await readFile(join(projectRoot, '.dev.vars.example'), 'utf8')
    const secretNames = [...devVarsExample.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*=/gm)].map(match => match[1])
    expect(secretNames).toEqual([])

    const wranglerConfig = parseJsonc(await readFile(join(projectRoot, 'wrangler.jsonc'), 'utf8'))
    expect(wranglerConfig.secrets).toBeUndefined()

    const packageJson = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8'))
    expect(Object.keys(packageJson.cloudflare.bindings)).not.toContain('NUXT_AUTH_SECRET')
    expect(Object.keys(packageJson.cloudflare.bindings)).not.toContain('NUXT_OAUTH_GOOGLE_CLIENT_ID')
    expect(Object.keys(packageJson.cloudflare.bindings)).not.toContain('NUXT_OAUTH_GOOGLE_CLIENT_SECRET')
  })
})
