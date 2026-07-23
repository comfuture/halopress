import {
  splitTokenizerChunks,
  type KoreanSearchTokenizer
} from '@halopress/korean-search-tokenizer'
import { extractSearchPlainText } from '@halopress/korean-search-tokenizer/plain-text'

import {
  activateIndexGeneration,
  claimFullTextJob,
  initializeIndexBuild,
  loadIndexTarget,
  markJobRetry,
  markJobStale,
  reconcileSchemaJobs,
  removeContentIndex,
  storeAnalyzedChunk,
  targetStillEligible
} from './repository'
import type { SearchWorkerEnv } from './types'

function parseRecord(value: string) {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

function sourceText(args: {
  contentJson: string
  registryJson: string
  fieldId: string
}) {
  const registry = parseRecord(args.registryJson)
  const fields = Array.isArray(registry.fields) ? registry.fields : []
  const field = fields.find((candidate) => {
    return candidate && typeof candidate === 'object'
      && (candidate as Record<string, unknown>).fieldId === args.fieldId
  }) as Record<string, unknown> | undefined
  if (!field || typeof field.key !== 'string') return null

  const content = parseRecord(args.contentJson)
  const value = content[field.key]
  if (field.kind === 'richtext') return extractSearchPlainText(value).text
  if (field.kind === 'string' || field.kind === 'text') {
    return typeof value === 'string' ? value : ''
  }
  return null
}

export async function processFullTextJob(args: {
  env: SearchWorkerEnv
  jobId: string
  tokenizer: () => Promise<KoreanSearchTokenizer>
}) {
  const job = await claimFullTextJob(args.env.DB, args.jobId)
  if (!job) return { outcome: 'not-claimed' as const, dispatchIds: [] as string[] }

  try {
    if (job.operation === 'remove') {
      const outcome = await removeContentIndex(args.env.DB, job)
      return { outcome, dispatchIds: [] as string[] }
    }
    if (job.operation === 'schema-sync' || job.operation === 'reindex-sync') {
      const dispatchIds = await reconcileSchemaJobs(args.env.DB, job)
      return { outcome: 'reconciled' as const, dispatchIds }
    }
    if (job.operation !== 'index' && job.operation !== 'reindex') {
      await markJobStale(args.env.DB, job, `Unsupported operation: ${job.operation}`)
      return { outcome: 'stale' as const, dispatchIds: [] as string[] }
    }

    const target = await loadIndexTarget(args.env.DB, job)
    if (!target
      || target.current_status !== 'published'
      || target.current_revision_id !== job.target_revision_id
      || target.full_text !== 1) {
      await markJobStale(args.env.DB, job, 'Publication or field eligibility changed')
      return { outcome: 'stale' as const, dispatchIds: [] as string[] }
    }
    const text = sourceText({
      contentJson: target.content_json,
      registryJson: target.registry_json,
      fieldId: job.field_id
    })
    if (text === null) {
      await markJobStale(args.env.DB, job, 'Published field contract is unavailable')
      return { outcome: 'stale' as const, dispatchIds: [] as string[] }
    }

    const chunks = splitTokenizerChunks(text)
    await initializeIndexBuild(args.env.DB, job, target, chunks.length)
    const analyzer = await args.tokenizer()
    for (let index = job.checkpoint; index < chunks.length; index += 1) {
      const terms = analyzer.analyzeDocument(chunks[index]!)
      await storeAnalyzedChunk({
        db: args.env.DB,
        job,
        target,
        chunkIndex: index,
        totalChunks: chunks.length,
        rawText: terms.rawTerms.join(' '),
        morphText: terms.morphTerms.join(' ')
      })
    }

    if (!await targetStillEligible(args.env.DB, job)) {
      await markJobStale(args.env.DB, job, 'Publication changed before activation')
      return { outcome: 'stale' as const, dispatchIds: [] as string[] }
    }
    await activateIndexGeneration(args.env.DB, job, target, chunks.length)
    return { outcome: 'ready' as const, dispatchIds: [] as string[] }
  } catch (error) {
    const retry = await markJobRetry(args.env.DB, job, error)
    return {
      outcome: retry.terminal ? 'failed' as const : 'retry' as const,
      dispatchIds: [] as string[],
      delaySeconds: retry.delay
    }
  }
}
