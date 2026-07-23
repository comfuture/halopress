import { setHeader } from 'h3'

import { KOREAN_SEARCH_TOKENIZER_GENERATION } from '@halopress/korean-search-tokenizer'

import { getRawDb } from '../../db/db'
import { getSchemaRoleKey } from '../../utils/schema-permission'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const mode = config.public.keywordSearchMode === 'server' ? 'server' : 'browser'
  const workerUrl = String(config.public.keywordSearchWorkerUrl || '').replace(/\/+$/u, '')
  const roleKey = await getSchemaRoleKey(event)
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
      FROM search_config config
      JOIN schema_active active
        ON active.schema_key = config.schema_key
       AND active.status = 'active'
      WHERE config.full_text = 1
        AND (
          ? = 1
          OR EXISTS (
            SELECT 1
            FROM schema_role gate
            WHERE gate.schema_key = config.schema_key
              AND gate.role_key = ?
              AND (
                gate.can_read = 1
                OR gate.can_write = 1
                OR gate.can_publish = 1
                OR gate.can_archive = 1
                OR gate.can_delete = 1
                OR gate.can_admin = 1
              )
          )
        )
    `).bind(roleKey === 'admin' ? 1 : 0, roleKey).first<{ count: number }>()
  ])
  const indexAvailable = control?.status === 'available' && Number(fields?.count) > 0
  setHeader(
    event,
    'Cache-Control',
    roleKey === 'anonymous'
      ? 'public, max-age=30, stale-while-revalidate=60'
      : 'private, no-store'
  )
  setHeader(event, 'Vary', 'Cookie')
  return {
    contractVersion: 1,
    mode,
    endpoint: '/api/keyword-search',
    browserFallback: Boolean(config.public.keywordSearchBrowserFallback),
    tokenizerGeneration: control?.tokenizer_generation ?? KOREAN_SEARCH_TOKENIZER_GENERATION,
    queryEpoch: control?.query_epoch ?? null,
    indexAvailable,
    available: indexAvailable
      && (mode === 'browser' || Boolean(workerUrl) || Boolean(config.public.keywordSearchBrowserFallback)),
    enabledFields: Number(fields?.count ?? 0)
  }
})
