import { createHash } from 'node:crypto'
import type { H3Event } from 'h3'
import { setHeader } from 'h3'

import { getTenantKey } from './tenant'

type CacheEntry<T> = {
  value: T
  createdAt: number
  freshUntil: number
  staleUntil: number
}

type CachePolicy = {
  softTtl: number
  hardTtl: number
  staleIfError?: number
}

type CacheStatus = 'hit' | 'stale' | 'miss'
type CacheBackend = 'memory' | 'kv'

const memoryCache = new Map<string, CacheEntry<any>>()
const inflight = new Map<string, Promise<any>>()
const scopeVersions = new Map<string, string>()

function getKvNamespace(event: H3Event) {
  const cf = (event as any)?.context?.cloudflare
  const env = cf?.env
  return env?.WIDGET_CACHE ?? env?.CACHE ?? env?.KV ?? null
}

function getWaitUntil(event: H3Event): ((promise: Promise<any>) => void) | null {
  const ctx = (event as any)?.context?.cloudflare
  return ctx?.ctx?.waitUntil
    ?? ctx?.context?.waitUntil
    ?? ctx?.waitUntil
    ?? (event as any)?.waitUntil
    ?? null
}

function normalizeParams(params: Record<string, unknown>) {
  const keys = Object.keys(params).filter(key => params[key] !== undefined && params[key] !== null).sort()
  const normalized: Record<string, unknown> = {}
  for (const key of keys) normalized[key] = params[key]
  return normalized
}

function hashParams(params: Record<string, unknown>) {
  const normalized = JSON.stringify(normalizeParams(params))
  return createHash('sha1').update(normalized).digest('hex').slice(0, 10)
}

export function buildWidgetCacheKey(event: H3Event, widget: string, version: string, params: Record<string, unknown>) {
  const tenant = getTenantKey(event)
  const paramHash = hashParams(params)
  return `${tenant}:${widget}:${version}:${paramHash}`
}

function makeScopeVersion() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function scopeStorageKey(tenant: string, scope: string) {
  return `__widget_scope:${tenant}:${scope}`
}

async function getScopeVersion(event: H3Event, scope: string) {
  const tenant = getTenantKey(event)
  const key = scopeStorageKey(tenant, scope)

  const cached = scopeVersions.get(key)
  if (cached) return cached

  const kv = getKvNamespace(event)
  if (kv) {
    const stored = await kv.get(key)
    if (stored) {
      scopeVersions.set(key, stored)
      return stored
    }
  }

  const next = makeScopeVersion()
  scopeVersions.set(key, next)
  if (kv) await kv.put(key, next)
  return next
}

export async function resolveWidgetCacheKey(
  event: H3Event,
  widget: string,
  version: string,
  params: Record<string, unknown>,
  scope?: string
) {
  const tenant = getTenantKey(event)
  const paramHash = hashParams(params)
  const scopeVersion = scope ? await getScopeVersion(event, scope) : 'global'
  return `${tenant}:${widget}:${version}:${scopeVersion}:${paramHash}`
}

export async function bumpWidgetCacheScope(event: H3Event, scope: string) {
  const tenant = getTenantKey(event)
  const key = scopeStorageKey(tenant, scope)
  const next = makeScopeVersion()
  scopeVersions.set(key, next)
  const kv = getKvNamespace(event)
  if (kv) await kv.put(key, next)
  return next
}

export function queueWidgetCacheInvalidation(event: H3Event, scope: string) {
  const waitUntil = getWaitUntil(event)
  const task = bumpWidgetCacheScope(event, scope)
  if (waitUntil) {
    waitUntil(task)
    return
  }
  task.catch(() => {})
}

export function applyWidgetCacheHeaders(event: H3Event, policy: CachePolicy, tags?: string[]) {
  const soft = Math.max(0, Math.floor(policy.softTtl))
  const hard = Math.max(soft, Math.floor(policy.hardTtl))
  const staleIfError = Math.max(0, Math.floor(policy.staleIfError ?? 86400))
  const swr = Math.max(0, hard - soft)

  setHeader(event, 'Cache-Control', `public, max-age=${soft}, stale-while-revalidate=${swr}, stale-if-error=${staleIfError}`)
  if (tags && tags.length) setHeader(event, 'CF-Cache-Tag', tags.join(','))
}

async function readCache<T>(event: H3Event, key: string): Promise<{ entry: CacheEntry<T> | null; backend: CacheBackend } | null> {
  const kv = getKvNamespace(event)
  if (kv) {
    const value = await kv.get(key, { type: 'json' })
    if (!value || typeof value !== 'object') return { entry: null, backend: 'kv' }
    const entry = value as CacheEntry<T>
    if (!entry?.staleUntil) return { entry: null, backend: 'kv' }
    return { entry, backend: 'kv' }
  }

  const entry = memoryCache.get(key) as CacheEntry<T> | undefined
  if (!entry) return { entry: null, backend: 'memory' }
  if (entry.staleUntil <= Date.now()) {
    memoryCache.delete(key)
    return { entry: null, backend: 'memory' }
  }
  return { entry, backend: 'memory' }
}

async function writeCache<T>(event: H3Event, key: string, entry: CacheEntry<T>, hardTtl: number) {
  const kv = getKvNamespace(event)
  if (kv) {
    await kv.put(key, JSON.stringify(entry), { expirationTtl: Math.max(1, Math.floor(hardTtl)) })
    return
  }
  memoryCache.set(key, entry)
}

async function refreshCache<T>(event: H3Event, key: string, policy: CachePolicy, loader: () => Promise<T>) {
  const existing = inflight.get(key) as Promise<T> | undefined
  if (existing) return existing

  const task = (async () => {
    const data = await loader()
    const now = Date.now()
    const softTtl = Math.max(0, Math.floor(policy.softTtl))
    const hardTtl = Math.max(softTtl, Math.floor(policy.hardTtl))
    const entry: CacheEntry<T> = {
      value: data,
      createdAt: now,
      freshUntil: now + softTtl * 1000,
      staleUntil: now + hardTtl * 1000
    }
    await writeCache(event, key, entry, hardTtl)
    return data
  })()

  inflight.set(key, task)
  task.finally(() => inflight.delete(key))
  return task
}

export async function withWidgetCache<T>(
  event: H3Event,
  key: string,
  policy: CachePolicy,
  loader: () => Promise<T>
): Promise<{ data: T; status: CacheStatus; backend: CacheBackend }>
{
  const now = Date.now()
  const cached = await readCache<T>(event, key)
  const backend = cached?.backend ?? 'memory'

  if (cached?.entry) {
    if (cached.entry.freshUntil > now) {
      return { data: cached.entry.value, status: 'hit', backend }
    }
    if (cached.entry.staleUntil > now) {
      const waitUntil = getWaitUntil(event)
      const refresh = refreshCache(event, key, policy, loader)
      if (waitUntil) waitUntil(refresh)
      else refresh.catch(() => {})
      return { data: cached.entry.value, status: 'stale', backend }
    }
  }

  const data = await refreshCache(event, key, policy, loader)
  return { data, status: 'miss', backend }
}
