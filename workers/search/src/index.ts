import { createWorkerTokenizer } from '@halopress/korean-search-tokenizer/worker'
import garuModel from './generated-assets/base.gmdl'
import garuWasmModule from './generated-assets/garu_wasm_bg.wasm'
import {
  KeywordSearchError,
  executeKeywordSearch,
  parseKeywordRawRequest,
  parseKeywordTokenRequest
} from '../../../shared/keyword-search'
import { pendingJobIds } from './repository'
import { processFullTextJob } from './indexer'
import type {
  ExecutionContext,
  MessageBatch,
  SearchQueueMessage,
  SearchWorkerEnv
} from './types'

const tokenizer = () => createWorkerTokenizer({
  wasmModule: garuWasmModule,
  modelData: garuModel
})

function corsHeaders(request: Request, env: SearchWorkerEnv) {
  const origin = request.headers.get('Origin')
  const configured = env.SEARCH_ALLOWED_ORIGINS?.split(',').map(value => value.trim()).filter(Boolean) ?? ['*']
  const allowed = configured.includes('*') ? '*' : origin && configured.includes(origin) ? origin : null
  return allowed
    ? {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        Vary: configured.includes('*') ? 'Accept-Encoding' : 'Origin, Accept-Encoding'
      }
    : null
}

function jsonError(error: unknown, headers: Record<string, string> = {}) {
  if (error instanceof KeywordSearchError) {
    return Response.json({
      error: {
        code: error.code,
        message: error.message,
        retryable: error.retryable
      }
    }, { status: error.status, headers })
  }
  return Response.json({
    error: {
      code: 'search_failed',
      message: 'Keyword search failed',
      retryable: true
    }
  }, { status: 503, headers })
}

async function dispatchPending(env: SearchWorkerEnv) {
  const ids = await pendingJobIds(env.DB)
  if (!ids.length) return 0
  await env.SEARCH_INDEX_QUEUE.sendBatch(ids.map(jobId => ({
    body: { kind: 'job' as const, jobId }
  })))
  return ids.length
}

export default {
  async fetch(request: Request, env: SearchWorkerEnv) {
    const url = new URL(request.url)
    const cors = corsHeaders(request, env)
    if (!cors && request.headers.has('Origin')) {
      return Response.json({ error: { code: 'origin_denied', message: 'Origin is not allowed' } }, { status: 403 })
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors ?? {} })
    }
    if (url.pathname === '/health') {
      return Response.json({
        ok: true,
        service: 'halopress-search',
        tokenizerGeneration: (await tokenizer()).metadata.tokenizerGeneration
      })
    }
    if (url.pathname === '/v1/search' && request.method === 'POST') {
      const headers = {
        ...(cors ?? {}),
        'Cache-Control': 'public, max-age=15, stale-while-revalidate=30',
        'X-Content-Type-Options': 'nosniff'
      }
      try {
        const contentLength = Number(request.headers.get('Content-Length') || 0)
        if (contentLength > 16 * 1024) {
          throw new KeywordSearchError('request_too_large', 'Search request is too large', 413)
        }
        const raw = parseKeywordRawRequest(await request.json())
        let analyzed
        try {
          analyzed = (await tokenizer()).analyzeQuery(raw.query)
        } catch {
          throw new KeywordSearchError('analyzer_unavailable', 'Search analyzer is unavailable', 503, true)
        }
        const tokenRequest = parseKeywordTokenRequest({
          ...raw,
          mode: 'tokens',
          tokenizerGeneration: analyzed.tokenizerGeneration,
          rawTerms: analyzed.rawTerms,
          morphTerms: analyzed.morphTerms
        })
        return Response.json(await executeKeywordSearch(env.DB, tokenRequest), { headers })
      } catch (error) {
        return jsonError(error, headers)
      }
    }
    return Response.json({ error: 'not_found' }, { status: 404 })
  },

  async queue(batch: MessageBatch<SearchQueueMessage>, env: SearchWorkerEnv) {
    for (const message of batch.messages) {
      if (message.body.kind === 'reconcile') {
        await dispatchPending(env)
        message.ack()
        continue
      }
      const result = await processFullTextJob({
        env,
        jobId: message.body.jobId,
        tokenizer
      })
      if (result.dispatchIds.length) {
        await env.SEARCH_INDEX_QUEUE.sendBatch(result.dispatchIds.map(jobId => ({
          body: { kind: 'job' as const, jobId }
        })))
      }
      if (result.outcome === 'retry') {
        message.retry({ delaySeconds: result.delaySeconds })
      } else {
        message.ack()
      }
    }
  },

  async scheduled(_controller: unknown, env: SearchWorkerEnv, ctx: ExecutionContext) {
    ctx.waitUntil(dispatchPending(env))
  }
}
