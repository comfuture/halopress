import { createWorkerTokenizer } from '@halopress/korean-search-tokenizer/worker'
import garuModel from './generated-assets/base.gmdl'
import garuWasmModule from './generated-assets/garu_wasm_bg.wasm'
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

async function dispatchPending(env: SearchWorkerEnv) {
  const ids = await pendingJobIds(env.DB)
  if (!ids.length) return 0
  await env.SEARCH_INDEX_QUEUE.sendBatch(ids.map(jobId => ({
    body: { kind: 'job' as const, jobId }
  })))
  return ids.length
}

export default {
  async fetch(request: Request) {
    const url = new URL(request.url)
    if (url.pathname === '/health') {
      return Response.json({
        ok: true,
        service: 'halopress-search',
        tokenizerGeneration: (await tokenizer()).metadata.tokenizerGeneration
      })
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
