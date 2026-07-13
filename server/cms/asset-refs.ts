import { and, eq } from 'drizzle-orm'

import type { Db } from '../db/db'
import { documentAssetRef } from '../db/schema'
import { executeDbStatement } from '../db/transaction'
import type { DbStatement } from '../db/transaction'

export type DocumentKind = 'content' | 'page'
export type ProjectionScope = 'working' | 'published'

const assetPathPattern = /(?:^|["'(\s])\/assets\/([^/?#"')\s]+)\/raw(?:[?#][^\s"')]*)?/g

export function extractDocumentAssetIds(value: unknown) {
  const ids = new Set<string>()
  const seen = new WeakSet<object>()

  const visit = (candidate: unknown) => {
    if (typeof candidate === 'string') {
      for (const match of candidate.matchAll(assetPathPattern)) {
        if (match[1]) ids.add(decodeURIComponent(match[1]))
      }
      return
    }
    if (!candidate || typeof candidate !== 'object') return
    if (seen.has(candidate)) return
    seen.add(candidate)
    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item)
      return
    }
    for (const item of Object.values(candidate as Record<string, unknown>)) visit(item)
  }

  visit(value)
  return [...ids].sort()
}

export async function syncDocumentAssetRefs(args: {
  db: Db
  documentKind: DocumentKind
  documentId: string
  projectionScope: ProjectionScope
  content: unknown
  additionalAssetIds?: string[]
  statements?: DbStatement[]
}) {
  await executeDbStatement(args.db
    .delete(documentAssetRef)
    .where(and(
      eq(documentAssetRef.documentKind, args.documentKind),
      eq(documentAssetRef.documentId, args.documentId),
      eq(documentAssetRef.projectionScope, args.projectionScope)
    )), args.statements)

  const assetIds = new Set([
    ...extractDocumentAssetIds(args.content),
    ...(args.additionalAssetIds ?? []).filter(Boolean)
  ])
  for (const assetId of [...assetIds].sort()) {
    await executeDbStatement(args.db.insert(documentAssetRef).values({
      documentKind: args.documentKind,
      documentId: args.documentId,
      projectionScope: args.projectionScope,
      assetId
    }), args.statements)
  }
}
