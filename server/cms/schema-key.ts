import { eq } from 'drizzle-orm'

import { isReservedSchemaKey } from '../../shared/public-routing'
import type { Db } from '../db/db'
import { schema as schemaTable, schemaDraft as schemaDraftTable } from '../db/schema'
import { badRequest } from '../utils/http'

export const RESERVED_SCHEMA_KEY_MESSAGE = 'Schema key is reserved for a public route'
export const RESERVED_SCHEMA_KEY_CODE = 'reserved_schema_key'

export function isReservedSchemaKeyError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { statusCode?: unknown, data?: { code?: unknown } }
  return candidate.statusCode === 400 && candidate.data?.code === RESERVED_SCHEMA_KEY_CODE
}

export async function assertSchemaKeyCanBePersisted(db: Db, schemaKey: string) {
  if (!isReservedSchemaKey(schemaKey)) return

  const existingVersion = await db
    .select({ schemaKey: schemaTable.schemaKey })
    .from(schemaTable)
    .where(eq(schemaTable.schemaKey, schemaKey))
    .limit(1)
  if (existingVersion[0]) return

  const existingDraft = await db
    .select({ schemaKey: schemaDraftTable.schemaKey })
    .from(schemaDraftTable)
    .where(eq(schemaDraftTable.schemaKey, schemaKey))
    .limit(1)
  if (existingDraft[0]) return

  throw badRequest(RESERVED_SCHEMA_KEY_MESSAGE, { code: RESERVED_SCHEMA_KEY_CODE })
}
