import type { H3Event } from 'h3'
import { and, asc, eq, isNull, notExists, sql } from 'drizzle-orm'

import {
  GLOBAL_SITE_MENU_ID,
  GLOBAL_SITE_MENU_NAME,
  defaultSiteMenuDocument,
  publicSiteMenuDocumentSchema,
  siteMenuCreateSchema,
  siteMenuDocumentSchema,
  siteMenuIdSchema,
  siteMenuNameKey,
  siteMenuUpdateSchema,
  type PublicSiteMenu,
  type ResolvedSiteMenuLeaf,
  type SiteMenuAdminResource,
  type SiteMenuDocument,
  type SiteMenuLeaf,
  type SiteMenuListResponse,
  type SiteMenuUsage,
  type SiteMenuValidationIssue
} from '../../shared/site-menu'
import {
  resolvePublicNavigationTarget,
  type PublicNavigationItem
} from '../../shared/site-presentation'
import { canonicalPathMap, type PublicDocumentKind } from '../cms/public-routes'
import type { Db } from '../db/db'
import { getDb } from '../db/db'
import {
  settings as settingsTable,
  siteMenuReference as siteMenuReferenceTable,
  siteMenuSet as siteMenuSetTable
} from '../db/schema'
import { executeDbStatement, withDbTransaction } from '../db/transaction'
import { newId } from './ids'

type SiteMenuRow = typeof siteMenuSetTable.$inferSelect

const PUBLIC_SITE_REFERENCE = {
  ownerType: 'public-site-shell',
  ownerId: 'default-public-site',
  slot: 'global-navigation',
  label: 'Built-in public Site navigation'
} as const

export class SiteMenuValidationError extends Error {
  readonly issues: SiteMenuValidationIssue[]

  constructor(issues: SiteMenuValidationIssue[] | string) {
    const normalized = typeof issues === 'string' ? [{ path: '', message: issues }] : issues
    super(normalized[0]?.message || 'Invalid menu set')
    this.name = 'SiteMenuValidationError'
    this.issues = normalized
  }
}

function zodValidationIssues(error: { issues: Array<{ path: PropertyKey[], message: string }> }) {
  return error.issues.map(issue => ({
    path: issue.path.map(String).join('.'),
    message: issue.message
  }))
}

export class SiteMenuNotFoundError extends Error {
  constructor() {
    super('Menu set not found')
    this.name = 'SiteMenuNotFoundError'
  }
}

export class SiteMenuNameConflictError extends Error {
  constructor() {
    super('A menu set with this name already exists')
    this.name = 'SiteMenuNameConflictError'
  }
}

export class SiteMenuStorageUnavailableError extends Error {
  constructor() {
    super('Menu storage is not ready. Apply the add_site_menu_sets database migration.')
    this.name = 'SiteMenuStorageUnavailableError'
  }
}

export class SiteMenuInUseError extends Error {
  readonly usage: SiteMenuUsage[]

  constructor(usage: SiteMenuUsage[]) {
    super('Menu set is in use and cannot be deleted')
    this.name = 'SiteMenuInUseError'
    this.usage = usage
  }
}

function errorMessages(error: unknown) {
  const seen = new Set<unknown>()
  let current: unknown = error
  const messages: string[] = []
  while (current && !seen.has(current)) {
    seen.add(current)
    const message = current instanceof Error
      ? current.message
      : typeof current === 'object' && 'message' in current
        ? String((current as { message?: unknown }).message || '')
        : String(current)
    messages.push(message)
    current = typeof current === 'object' && 'cause' in current
      ? (current as { cause?: unknown }).cause
      : null
  }
  return messages
}

function isMissingSiteMenuTableError(error: unknown) {
  return errorMessages(error).some(message => message.includes('no such table: site_menu_'))
}

function isUniqueNameError(error: unknown) {
  return errorMessages(error).some(message => message.includes('UNIQUE constraint failed')
    || message.includes('idx_site_menu_set_name_unique'))
}

function isForeignKeyConstraintError(error: unknown) {
  return errorMessages(error).some(message => message.includes('FOREIGN KEY constraint failed')
    || message.includes('SQLITE_CONSTRAINT_FOREIGNKEY'))
}

function legacyDocument(items: PublicNavigationItem[]): SiteMenuDocument {
  const parsed = siteMenuDocumentSchema.safeParse({ version: 1, items })
  return parsed.success ? parsed.data : defaultSiteMenuDocument()
}

export function parseStoredSiteMenu(row: SiteMenuRow) {
  try {
    const parsed = siteMenuDocumentSchema.safeParse(JSON.parse(row.documentJson))
    if (parsed.success) {
      return { document: parsed.data, malformedStoredValue: false }
    }
  } catch {
    // Fall through to a safe empty document that an administrator can repair.
  }
  return { document: defaultSiteMenuDocument(), malformedStoredValue: true }
}

/**
 * Central deletion-guard seam for Site resources. #70 can extend this function
 * with persisted SiteLayout references without coupling menu documents to Nuxt
 * application layouts.
 */
export async function listSiteMenuUsage(db: Db, menuId: string): Promise<SiteMenuUsage[]> {
  const rows = await db.select({
    ownerType: siteMenuReferenceTable.ownerType,
    ownerId: siteMenuReferenceTable.ownerId,
    label: siteMenuReferenceTable.label
  }).from(siteMenuReferenceTable).where(eq(siteMenuReferenceTable.menuSetId, menuId))
  return rows.map((row: { ownerType: string, ownerId: string, label: string }) => ({
    resourceType: row.ownerType === 'site-layout' ? 'site-layout' : 'public-site-shell',
    resourceId: row.ownerId,
    label: row.label
  }))
}

async function rowToAdminResource(db: Db, row: SiteMenuRow): Promise<SiteMenuAdminResource> {
  const parsed = parseStoredSiteMenu(row)
  const usage = await listSiteMenuUsage(db, row.id)
  return {
    id: row.id,
    name: row.name,
    document: parsed.document,
    malformedStoredValue: parsed.malformedStoredValue,
    createdBy: row.createdBy ?? null,
    updatedBy: row.updatedBy ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    usage,
    canDelete: usage.length === 0
  }
}

type SiteMenuBootstrapOptions = {
  afterLegacyRead?: () => Promise<void>
  repairReference?: boolean
}

async function legacyBootstrapSeed(db: Db, options: SiteMenuBootstrapOptions = {}) {
  const row = await db.select({
    value: settingsTable.value,
    valueType: settingsTable.valueType,
    isEncrypted: settingsTable.isEncrypted,
    updatedBy: settingsTable.updatedBy,
    updatedAt: settingsTable.updatedAt
  }).from(settingsTable).where(and(
    eq(settingsTable.scope, 'global'),
    eq(settingsTable.key, 'site.presentation')
  )).get()

  let document = defaultSiteMenuDocument()
  if (row && !row.isEncrypted && row.valueType === 'json') {
    try {
      const value = JSON.parse(row.value) as { navigation?: { items?: unknown } }
      const parsed = siteMenuDocumentSchema.safeParse({ version: 1, items: value.navigation?.items })
      if (parsed.success) document = parsed.data
    } catch {
      // Invalid legacy settings intentionally bootstrap the safe empty document.
    }
  }
  const seed = {
    document,
    actorId: row?.updatedBy ?? null,
    sourceUpdatedAt: row?.updatedAt ?? null
  }
  await options.afterLegacyRead?.()
  return seed
}

function sourceTime(value: Date | null) {
  return value?.getTime() ?? 0
}

function bootstrapSourceMatches(row: SiteMenuRow, seed: Awaited<ReturnType<typeof legacyBootstrapSeed>>) {
  return sourceTime(seed.sourceUpdatedAt) <= sourceTime(row.bootstrapSourceUpdatedAt)
    && row.documentJson === JSON.stringify(seed.document)
}

type SiteMenuNameRow = Pick<SiteMenuRow, 'id' | 'name' | 'nameKey'>

const NAME_CONFLICT_KEY_PREFIX = 'halopress:reserved:site-menu-name-conflict:'
const NAME_REPAIR_KEY_PREFIX = 'halopress:reserved:site-menu-name-repair:'

function allocateReservedNameKey(prefix: string, id: string, unavailable: Set<string>) {
  let candidate = `${prefix}${id}`
  while (unavailable.has(candidate)) candidate += ':'
  unavailable.add(candidate)
  return candidate
}

function siteMenuNameKeyTargets(rows: SiteMenuNameRow[]) {
  const groups = new Map<string, SiteMenuNameRow[]>()
  for (const row of rows) {
    const key = siteMenuNameKey(row.name)
    const group = groups.get(key) ?? []
    group.push(row)
    groups.set(key, group)
  }

  // Keep every normalized display-name key unavailable to the reserved
  // namespace, including duplicate groups whose canonical key remains vacant.
  const unavailable = new Set(groups.keys())
  const targets = new Map<string, string>()
  for (const [key, group] of groups) {
    if (group.length === 1) {
      targets.set(group[0]!.id, key)
      continue
    }
    for (const row of group) {
      targets.set(row.id, allocateReservedNameKey(NAME_CONFLICT_KEY_PREFIX, row.id, unavailable))
    }
  }
  return targets
}

async function readSiteMenuNameRows(db: Db): Promise<SiteMenuNameRow[]> {
  return await db.select({
    id: siteMenuSetTable.id,
    name: siteMenuSetTable.name,
    nameKey: siteMenuSetTable.nameKey
  }).from(siteMenuSetTable).orderBy(asc(siteMenuSetTable.id))
}

async function repairSiteMenuNameKeys(event: H3Event, db: Db) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const rows = await readSiteMenuNameRows(db)
    const targets = siteMenuNameKeyTargets(rows)
    const changes = rows.filter(row => row.nameKey !== targets.get(row.id))
    if (!changes.length) return

    const unavailable = new Set([
      ...rows.map(row => row.nameKey),
      ...targets.values()
    ])
    const temporaryKeys = new Map(changes.map(row => [
      row.id,
      allocateReservedNameKey(NAME_REPAIR_KEY_PREFIX, row.id, unavailable)
    ]))

    await withDbTransaction(event, db, async (tx, statements) => {
      for (const row of changes) {
        await executeDbStatement(tx.update(siteMenuSetTable).set({
          nameKey: temporaryKeys.get(row.id)!
        }).where(and(
          eq(siteMenuSetTable.id, row.id),
          eq(siteMenuSetTable.nameKey, row.nameKey)
        )), statements)
      }
      for (const row of changes) {
        await executeDbStatement(tx.update(siteMenuSetTable).set({
          nameKey: targets.get(row.id)!
        }).where(and(
          eq(siteMenuSetTable.id, row.id),
          eq(siteMenuSetTable.nameKey, temporaryKeys.get(row.id)!)
        )), statements)
      }
    })

    const verified = await readSiteMenuNameRows(db)
    const verifiedTargets = siteMenuNameKeyTargets(verified)
    if (verified.every(row => row.nameKey === verifiedTargets.get(row.id))) return
  }
  throw new Error('Menu name storage changed repeatedly while repairing normalized keys')
}

async function assertSiteMenuNameAvailable(db: Db, name: string, excludedId?: string) {
  const candidate = siteMenuNameKey(name)
  const rows = await db.select({ id: siteMenuSetTable.id, name: siteMenuSetTable.name })
    .from(siteMenuSetTable)
  if (rows.some((row: { id: string, name: string }) => (
    row.id !== excludedId && siteMenuNameKey(row.name) === candidate
  ))) {
    throw new SiteMenuNameConflictError()
  }
}

async function ensurePublicSiteMenuReference(db: Db, now: Date) {
  await db.insert(siteMenuReferenceTable).values({
    ...PUBLIC_SITE_REFERENCE,
    menuSetId: GLOBAL_SITE_MENU_ID,
    createdAt: now,
    updatedAt: now
  }).onConflictDoNothing()
}

/**
 * Reconciles old-Worker navigation writes until the first named-menu save.
 * bootstrapOwned is cleared in that same checked menu UPDATE, making the editor
 * the permanent source of truth without a read/check/write ownership race.
 */
export async function ensureGlobalSiteMenu(
  event: H3Event,
  db: Db,
  options: SiteMenuBootstrapOptions = {}
) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const existing = await db.select().from(siteMenuSetTable)
      .where(eq(siteMenuSetTable.id, GLOBAL_SITE_MENU_ID)).get() as SiteMenuRow | undefined
    const now = new Date()

    if (existing && !existing.bootstrapOwned) {
      if (options.repairReference) await ensurePublicSiteMenuReference(db, now)
      return existing
    }

    const seed = await legacyBootstrapSeed(db, options)

    if (!existing) {
      const sourceUpdatedAt = seed.sourceUpdatedAt
      await withDbTransaction(event, db, async (tx, statements) => {
        await executeDbStatement(tx.insert(siteMenuSetTable).values({
          id: GLOBAL_SITE_MENU_ID,
          name: GLOBAL_SITE_MENU_NAME,
          nameKey: siteMenuNameKey(GLOBAL_SITE_MENU_NAME),
          documentJson: JSON.stringify(seed.document),
          bootstrapOwned: true,
          bootstrapSourceUpdatedAt: sourceUpdatedAt,
          createdBy: seed.actorId,
          updatedBy: seed.actorId,
          createdAt: sourceUpdatedAt ?? now,
          updatedAt: sourceUpdatedAt ?? now
        }).onConflictDoNothing(), statements)
        await executeDbStatement(tx.insert(siteMenuReferenceTable).values({
          ...PUBLIC_SITE_REFERENCE,
          menuSetId: GLOBAL_SITE_MENU_ID,
          createdAt: now,
          updatedAt: now
        }).onConflictDoNothing(), statements)
      })
      continue
    }

    if (options.repairReference) await ensurePublicSiteMenuReference(db, now)

    if (bootstrapSourceMatches(existing, seed)) {
      // A second source read closes the old-writer interleaving between the
      // first SELECT and the observed Global row.
      const verification = await legacyBootstrapSeed(db, options)
      if (bootstrapSourceMatches(existing, verification)) return existing
      continue
    }

    if (sourceTime(seed.sourceUpdatedAt) < sourceTime(existing.bootstrapSourceUpdatedAt)) return existing

    const observedSource = existing.bootstrapSourceUpdatedAt
    const sourceGuard = observedSource
      ? eq(siteMenuSetTable.bootstrapSourceUpdatedAt, observedSource)
      : isNull(siteMenuSetTable.bootstrapSourceUpdatedAt)
    if (existing.documentJson === JSON.stringify(seed.document)) {
      // site.presentation has one timestamp for every section. A newer change
      // to Appearance or Footer advances the observed source without falsely
      // attributing unchanged navigation to that settings editor.
      await db.update(siteMenuSetTable).set({
        bootstrapSourceUpdatedAt: seed.sourceUpdatedAt
      }).where(and(
        eq(siteMenuSetTable.id, GLOBAL_SITE_MENU_ID),
        eq(siteMenuSetTable.bootstrapOwned, true),
        sourceGuard,
        eq(siteMenuSetTable.documentJson, existing.documentJson)
      )).returning({ id: siteMenuSetTable.id })
      continue
    }
    await db.update(siteMenuSetTable).set({
      name: GLOBAL_SITE_MENU_NAME,
      nameKey: siteMenuNameKey(GLOBAL_SITE_MENU_NAME),
      documentJson: JSON.stringify(seed.document),
      bootstrapSourceUpdatedAt: seed.sourceUpdatedAt,
      updatedBy: seed.actorId,
      updatedAt: seed.sourceUpdatedAt ?? now
    }).where(and(
      eq(siteMenuSetTable.id, GLOBAL_SITE_MENU_ID),
      eq(siteMenuSetTable.bootstrapOwned, true),
      sourceGuard,
      eq(siteMenuSetTable.documentJson, existing.documentJson)
    )).returning({ id: siteMenuSetTable.id })
  }

  const global = await db.select().from(siteMenuSetTable)
    .where(eq(siteMenuSetTable.id, GLOBAL_SITE_MENU_ID)).get()
  if (!global) throw new SiteMenuStorageUnavailableError()
  return global as SiteMenuRow
}

export async function listSiteMenus(event: H3Event): Promise<SiteMenuListResponse> {
  const db = await getDb(event)
  try {
    await ensureGlobalSiteMenu(event, db, { repairReference: true })
    await repairSiteMenuNameKeys(event, db)
    const rows = await db.select().from(siteMenuSetTable)
      .orderBy(asc(siteMenuSetTable.nameKey))
    return {
      defaultMenuId: GLOBAL_SITE_MENU_ID,
      items: await Promise.all(rows.map((row: SiteMenuRow) => rowToAdminResource(db, row)))
    }
  } catch (error) {
    if (isMissingSiteMenuTableError(error)) throw new SiteMenuStorageUnavailableError()
    throw error
  }
}

export async function createSiteMenu(
  event: H3Event,
  body: unknown,
  actorId: string | null
): Promise<SiteMenuAdminResource> {
  const parsed = siteMenuCreateSchema.safeParse(body)
  if (!parsed.success) {
    throw new SiteMenuValidationError(zodValidationIssues(parsed.error))
  }

  const db = await getDb(event)
  try {
    await ensureGlobalSiteMenu(event, db, { repairReference: true })
    await repairSiteMenuNameKeys(event, db)
    await assertSiteMenuNameAvailable(db, parsed.data.name)
  } catch (error) {
    if (isMissingSiteMenuTableError(error)) throw new SiteMenuStorageUnavailableError()
    throw error
  }
  const now = new Date()
  const row = {
    id: newId(),
    name: parsed.data.name,
    nameKey: siteMenuNameKey(parsed.data.name),
    documentJson: JSON.stringify(defaultSiteMenuDocument()),
    bootstrapOwned: false,
    bootstrapSourceUpdatedAt: null,
    createdBy: actorId,
    updatedBy: actorId,
    createdAt: now,
    updatedAt: now
  }

  try {
    await db.insert(siteMenuSetTable).values(row)
  } catch (error) {
    if (isMissingSiteMenuTableError(error)) throw new SiteMenuStorageUnavailableError()
    if (isUniqueNameError(error)) throw new SiteMenuNameConflictError()
    throw error
  }
  return await rowToAdminResource(db, row)
}

export async function updateSiteMenu(
  event: H3Event,
  menuIdInput: unknown,
  body: unknown,
  actorId: string | null
): Promise<SiteMenuAdminResource> {
  const menuId = siteMenuIdSchema.safeParse(menuIdInput)
  if (!menuId.success) throw new SiteMenuValidationError('Invalid menu set ID')

  const parsed = siteMenuUpdateSchema.safeParse(body)
  if (!parsed.success) {
    throw new SiteMenuValidationError(zodValidationIssues(parsed.error))
  }

  const db = await getDb(event)
  let existing: SiteMenuRow | undefined
  try {
    await ensureGlobalSiteMenu(event, db, { repairReference: true })
    await repairSiteMenuNameKeys(event, db)
    existing = await db.select().from(siteMenuSetTable)
      .where(eq(siteMenuSetTable.id, menuId.data)).get()
  } catch (error) {
    if (isMissingSiteMenuTableError(error)) throw new SiteMenuStorageUnavailableError()
    throw error
  }
  if (!existing) throw new SiteMenuNotFoundError()
  await assertSiteMenuNameAvailable(db, parsed.data.name, menuId.data)

  const next: SiteMenuRow = {
    ...existing,
    name: parsed.data.name,
    nameKey: siteMenuNameKey(parsed.data.name),
    documentJson: JSON.stringify(parsed.data.document),
    bootstrapOwned: false,
    bootstrapSourceUpdatedAt: null,
    updatedBy: actorId,
    updatedAt: new Date()
  }
  try {
    // A whole-document update keeps reorder, field edits, and rename atomic.
    const updated = await db.update(siteMenuSetTable).set({
      name: next.name,
      nameKey: next.nameKey,
      documentJson: next.documentJson,
      bootstrapOwned: false,
      bootstrapSourceUpdatedAt: null,
      updatedBy: next.updatedBy,
      updatedAt: next.updatedAt
    }).where(eq(siteMenuSetTable.id, menuId.data)).returning({ id: siteMenuSetTable.id })
    if (!updated.some((row: { id: string }) => row.id === menuId.data)) throw new SiteMenuNotFoundError()
  } catch (error) {
    if (isUniqueNameError(error)) throw new SiteMenuNameConflictError()
    throw error
  }
  return await rowToAdminResource(db, next)
}

export async function deleteSiteMenu(event: H3Event, menuIdInput: unknown) {
  const menuId = siteMenuIdSchema.safeParse(menuIdInput)
  if (!menuId.success) throw new SiteMenuValidationError('Invalid menu set ID')

  const db = await getDb(event)
  let existing: SiteMenuRow | undefined
  try {
    await ensureGlobalSiteMenu(event, db, { repairReference: true })
    existing = await db.select().from(siteMenuSetTable)
      .where(eq(siteMenuSetTable.id, menuId.data)).get()
  } catch (error) {
    if (isMissingSiteMenuTableError(error)) throw new SiteMenuStorageUnavailableError()
    throw error
  }
  if (!existing) throw new SiteMenuNotFoundError()

  try {
    // The NOT EXISTS predicate makes the guard and deletion one conditional
    // operation; the restrictive FK remains the final authority if a future
    // Site Layout reference is inserted concurrently.
    await withDbTransaction(event, db, async (tx, statements) => {
      await executeDbStatement(tx.delete(siteMenuSetTable).where(and(
        eq(siteMenuSetTable.id, menuId.data),
        notExists(tx.select({ one: sql`1` }).from(siteMenuReferenceTable)
          .where(eq(siteMenuReferenceTable.menuSetId, menuId.data)))
      )), statements)
    })
  } catch (error) {
    if (isForeignKeyConstraintError(error)) {
      throw new SiteMenuInUseError(await listSiteMenuUsage(db, menuId.data))
    }
    throw error
  }
  // D1 batch statements do not expose RETURNING rows to the transaction
  // callback, so verify the affected row explicitly on every runtime.
  const remaining = await db.select({ id: siteMenuSetTable.id }).from(siteMenuSetTable)
    .where(eq(siteMenuSetTable.id, menuId.data)).get()
  if (remaining) throw new SiteMenuInUseError(await listSiteMenuUsage(db, menuId.data))
  return { deleted: true as const, id: menuId.data }
}

export async function getGlobalSiteMenuDocument(
  event: H3Event,
  legacyItems: PublicNavigationItem[]
): Promise<SiteMenuDocument> {
  const fallback = legacyDocument(legacyItems)
  const db = await getDb(event)
  try {
    const row = await ensureGlobalSiteMenu(event, db)
    return parseStoredSiteMenu(row).document
  } catch (error) {
    // app.vue requests presentation before installation is complete. A rolling
    // deploy without migration 0008 must retain the legacy navigation safely.
    if (isMissingSiteMenuTableError(error)) return fallback
    throw error
  }
}

export async function resolvePublicSiteMenu(
  event: H3Event,
  legacyItems: PublicNavigationItem[]
): Promise<PublicSiteMenu> {
  const document = await getGlobalSiteMenuDocument(event, legacyItems)
  const destinations = document.items.flatMap(item => [
    item.destination,
    ...item.children.map(child => child.destination)
  ])
  const identities = destinations.flatMap((destination) => {
    if (destination.type === 'page') return [{ documentKind: 'page' as PublicDocumentKind, documentId: destination.pageId }]
    if (destination.type === 'collection') return [{ documentKind: 'schema' as PublicDocumentKind, documentId: destination.schemaKey }]
    if (destination.type === 'content') return [{ documentKind: 'content' as PublicDocumentKind, documentId: destination.contentId }]
    return []
  })
  const paths = await canonicalPathMap(await getDb(event), identities)
  const resolveLeaf = (item: SiteMenuLeaf): ResolvedSiteMenuLeaf => {
    const key = item.destination.type === 'page'
      ? `page:${item.destination.pageId}`
      : item.destination.type === 'collection'
        ? `schema:${item.destination.schemaKey}`
        : item.destination.type === 'content'
          ? `content:${item.destination.contentId}`
          : null
    const externalWindow = item.destination.type === 'external' && item.destination.newWindow
    return {
      id: item.id,
      label: item.label,
      to: key && paths.get(key) ? paths.get(key)! : resolvePublicNavigationTarget(item.destination),
      value: item.value || item.id,
      icon: item.icon,
      badge: item.badge,
      target: externalWindow ? '_blank' : undefined,
      rel: externalWindow ? 'noopener noreferrer' : undefined
    }
  }

  const publicDocument = publicSiteMenuDocumentSchema.parse({
    version: 1,
    items: document.items.map(item => ({
      ...resolveLeaf(item),
      children: item.children.map(resolveLeaf)
    }))
  })

  return {
    id: GLOBAL_SITE_MENU_ID,
    name: GLOBAL_SITE_MENU_NAME,
    document: publicDocument
  }
}
