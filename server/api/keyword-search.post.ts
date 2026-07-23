import { createError, readBody, setHeader } from 'h3'

import {
  KeywordSearchError,
  executeKeywordSearch,
  parseKeywordTokenRequest
} from '../../shared/keyword-search'
import { getRawDb } from '../db/db'

export default defineEventHandler(async (event) => {
  try {
    const request = parseKeywordTokenRequest(await readBody(event))
    const result = await executeKeywordSearch(await getRawDb(event), request)
    setHeader(event, 'Cache-Control', 'public, max-age=15, stale-while-revalidate=30')
    setHeader(event, 'X-Content-Type-Options', 'nosniff')
    return result
  } catch (error) {
    if (error instanceof KeywordSearchError) {
      throw createError({
        statusCode: error.status,
        statusMessage: error.message,
        data: { code: error.code, retryable: error.retryable }
      })
    }
    throw error
  }
})
