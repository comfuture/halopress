import { setHeader } from 'h3'

import { KOREAN_SEARCH_TOKENIZER_GENERATION } from '@halopress/korean-search-tokenizer'

import { getRawDb } from '../../db/db'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const mode = config.public.keywordSearchMode === 'server' ? 'server' : 'browser'
  const workerUrl = String(config.public.keywordSearchWorkerUrl || '').replace(/\/+$/u, '')
  const db = await getRawDb(event)
  const [control, fields] = await Promise.all([
    db.prepare(`
      SELECT tokenizer_generation, query_epoch, status
      FROM full_text_control WHERE key = 'singleton'
    `).bind().first<{
      tokenizer_generation: string
      query_epoch: number
      status: string
    }>(),
    db.prepare(`
      SELECT count(*) AS count
      FROM search_config
      WHERE full_text = 1
    `).bind().first<{ count: number }>()
  ])
  const indexAvailable = control?.status === 'available' && Number(fields?.count) > 0
  setHeader(event, 'Cache-Control', 'public, max-age=30, stale-while-revalidate=60')
  return {
    contractVersion: 1,
    mode,
    endpoint: mode === 'server'
      ? workerUrl ? `${workerUrl}/v1/search` : null
      : '/api/keyword-search',
    browserFallback: Boolean(config.public.keywordSearchBrowserFallback),
    tokenizerGeneration: control?.tokenizer_generation ?? KOREAN_SEARCH_TOKENIZER_GENERATION,
    queryEpoch: control?.query_epoch ?? null,
    indexAvailable,
    available: indexAvailable
      && (mode === 'browser' || Boolean(workerUrl) || Boolean(config.public.keywordSearchBrowserFallback)),
    enabledFields: Number(fields?.count ?? 0)
  }
})
