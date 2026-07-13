import { eq } from 'drizzle-orm'

import { isReservedSchemaKey } from '../../shared/public-routing'
import type { Db } from '../db/db'
import { schema as schemaTable, schemaDraft as schemaDraftTable } from '../db/schema'
import { badRequest } from '../utils/http'

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

  throw badRequest('Schema key is reserved for a public route')
}
