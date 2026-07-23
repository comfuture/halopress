import type { H3Event } from 'h3'

import type {
  SearchAnalyzerRuntimeEnv
} from '../../shared/search-analyzer'
import {
  KeywordSearchError,
  type KeywordSearchRawRequest
} from '../../shared/keyword-search'

function runtimeEnv(event: H3Event) {
  return ((event as any)?.context?.cloudflare?.env ?? {}) as SearchAnalyzerRuntimeEnv
}

export function hasServerSearchAnalyzer(event: H3Event) {
  const env = runtimeEnv(event)
  return Boolean(env.HALOPRESS_SEARCH_ANALYZER)
}

export async function analyzeKeywordSearchRequest(
  event: H3Event,
  raw: KeywordSearchRawRequest
) {
  const env = runtimeEnv(event)
  if (env.HALOPRESS_SEARCH_ANALYZER) {
    try {
      return await env.HALOPRESS_SEARCH_ANALYZER.analyzeQuery(raw.query)
    } catch {
      throw new KeywordSearchError(
        'analyzer_unavailable',
        'Search analyzer is unavailable',
        503,
        true
      )
    }
  }
  throw new KeywordSearchError(
    'analyzer_unavailable',
    'Search analyzer is unavailable',
    503,
    true
  )
}
