#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { applyEdits, modify, parse } from 'jsonc-parser'

const MAX_RESOURCE_NAME_LENGTH = 63
const SEARCH_QUEUE_BINDING = 'SEARCH_INDEX_QUEUE'
const SEARCH_SERVICE_BINDING = 'SEARCH_WORKER'

function parseArgs(argv) {
  const options = {
    config: undefined,
    env: undefined,
    mainName: undefined,
    searchConfig: undefined,
    searchQueueName: undefined,
    searchWorkerName: undefined
  }
  const args = [...argv]

  while (args.length > 0) {
    const argument = args.shift()
    const key = {
      '--config': 'config',
      '--env': 'env',
      '--main-name': 'mainName',
      '--search-config': 'searchConfig',
      '--search-queue-name': 'searchQueueName',
      '--search-worker-name': 'searchWorkerName'
    }[argument]
    if (!key) throw new Error(`Unsupported search topology argument: ${argument}`)

    const value = args.shift()
    if (!value) throw new Error(`Missing value for ${argument}`)
    options[key] = value
  }

  if (!options.config) throw new Error('Missing value for --config')
  if (!options.searchConfig) throw new Error('Missing value for --search-config')
  return options
}

function parseConfig(text, configPath) {
  const errors = []
  const config = parse(text, errors, { allowTrailingComma: true, disallowComments: false })
  if (errors.length > 0 || !config || typeof config !== 'object') {
    throw new Error(`Could not parse JSONC config: ${configPath}`)
  }
  return config
}

function scopedResourceName(mainName, suffix) {
  const candidate = `${mainName}${suffix}`
  if (candidate.length <= MAX_RESOURCE_NAME_LENGTH) return candidate

  const digest = createHash('sha256').update(mainName).digest('hex').slice(0, 8)
  const prefixLength = MAX_RESOURCE_NAME_LENGTH - suffix.length - digest.length - 1
  if (prefixLength < 1) throw new Error(`Cannot derive a scoped resource name from "${mainName}"`)
  return `${mainName.slice(0, prefixLength)}-${digest}${suffix}`
}

function updateJsonc(text, path, value) {
  return applyEdits(text, modify(text, path, value, {
    formattingOptions: { insertSpaces: true, tabSize: 2, eol: '\n' }
  }))
}

function updateBinding(entries, binding, property, value) {
  const next = Array.isArray(entries) ? entries.map(entry => ({ ...entry })) : []
  const matches = next
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry?.binding === binding)
  if (matches.length > 1) throw new Error(`Binding "${binding}" is declared more than once`)

  if (matches.length === 1) {
    next[matches[0].index][property] = value
  } else {
    next.push({ binding, [property]: value })
  }
  return next
}

function requireSingleQueueBinding(config, configPath) {
  const producers = config.queues?.producers
  const consumers = config.queues?.consumers
  const producerMatches = Array.isArray(producers)
    ? producers.filter(entry => entry?.binding === SEARCH_QUEUE_BINDING)
    : []
  if (producerMatches.length !== 1) {
    throw new Error(`Search Worker must declare exactly one ${SEARCH_QUEUE_BINDING} producer in ${configPath}`)
  }
  if (!Array.isArray(consumers) || consumers.length !== 1) {
    throw new Error(`Search Worker must declare exactly one Queue consumer in ${configPath}`)
  }
}

export async function prepareSearchTopology(options) {
  const configPath = resolve(options.config)
  const searchConfigPath = resolve(options.searchConfig)
  let mainText = await readFile(configPath, 'utf8')
  let searchText = await readFile(searchConfigPath, 'utf8')
  let mainConfig = parseConfig(mainText, configPath)
  let searchConfig = parseConfig(searchText, searchConfigPath)
  requireSingleQueueBinding(searchConfig, searchConfigPath)

  const mainScope = options.env ? mainConfig.env?.[options.env] : mainConfig
  if (options.env && (!mainScope || typeof mainScope !== 'object')) {
    throw new Error(`Wrangler environment not found: ${options.env}`)
  }

  const configuredMainName = options.env
    ? mainScope.name || (mainConfig.name ? `${mainConfig.name}-${options.env}` : undefined)
    : mainConfig.name
  const mainName = options.mainName?.trim() || configuredMainName?.trim()
  if (!mainName) throw new Error(`Main Worker name is missing in ${configPath}`)

  const searchWorkerName = options.searchWorkerName?.trim()
    || scopedResourceName(mainName, '-search')
  const searchQueueName = options.searchQueueName?.trim()
    || scopedResourceName(mainName, '-search-index')
  if (searchWorkerName === mainName) {
    throw new Error('Search Worker name must differ from the main Worker name')
  }

  const mainScopePath = options.env ? ['env', options.env] : []
  mainText = updateJsonc(mainText, [...mainScopePath, 'name'], mainName)
  mainConfig = parseConfig(mainText, configPath)
  const updatedMainScope = options.env ? mainConfig.env[options.env] : mainConfig
  const producers = updateBinding(
    updatedMainScope.queues?.producers,
    SEARCH_QUEUE_BINDING,
    'queue',
    searchQueueName
  )
  const services = updateBinding(
    updatedMainScope.services,
    SEARCH_SERVICE_BINDING,
    'service',
    searchWorkerName
  )
  mainText = updateJsonc(mainText, [...mainScopePath, 'queues', 'producers'], producers)
  mainText = updateJsonc(mainText, [...mainScopePath, 'services'], services)

  searchText = updateJsonc(searchText, ['name'], searchWorkerName)
  searchConfig = parseConfig(searchText, searchConfigPath)
  const searchProducers = updateBinding(
    searchConfig.queues.producers,
    SEARCH_QUEUE_BINDING,
    'queue',
    searchQueueName
  )
  const searchConsumers = searchConfig.queues.consumers.map(consumer => ({
    ...consumer,
    queue: searchQueueName
  }))
  searchText = updateJsonc(searchText, ['queues', 'producers'], searchProducers)
  searchText = updateJsonc(searchText, ['queues', 'consumers'], searchConsumers)

  await writeFile(configPath, mainText)
  await writeFile(searchConfigPath, searchText)

  const verifiedMain = parseConfig(mainText, configPath)
  const verifiedScope = options.env ? verifiedMain.env?.[options.env] : verifiedMain
  const verifiedSearch = parseConfig(searchText, searchConfigPath)
  const verifiedProducer = verifiedScope.queues?.producers
    ?.find(entry => entry?.binding === SEARCH_QUEUE_BINDING)
  const verifiedService = verifiedScope.services
    ?.find(entry => entry?.binding === SEARCH_SERVICE_BINDING)
  const verifiedSearchProducer = verifiedSearch.queues?.producers
    ?.find(entry => entry?.binding === SEARCH_QUEUE_BINDING)
  if (verifiedScope.name !== mainName
    || verifiedProducer?.queue !== searchQueueName
    || verifiedService?.service !== searchWorkerName
    || verifiedSearch.name !== searchWorkerName
    || verifiedSearchProducer?.queue !== searchQueueName
    || verifiedSearch.queues?.consumers?.[0]?.queue !== searchQueueName) {
    throw new Error('Failed to prepare scoped Cloudflare search topology')
  }

  return {
    configPath,
    mainName,
    searchConfigPath,
    searchQueueName,
    searchWorkerName
  }
}

const isEntrypoint = process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
if (isEntrypoint) {
  try {
    const result = await prepareSearchTopology(parseArgs(process.argv.slice(2)))
    process.stdout.write(`${JSON.stringify(result)}\n`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
