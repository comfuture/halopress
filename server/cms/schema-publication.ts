import type { H3Event } from 'h3'

import type { Db } from '../db/db'
import {
  schema as schemaTable,
  schemaActive as schemaActiveTable,
  schemaRole as schemaRoleTable
} from '../db/schema'
import { executeDbStatement, withDbTransaction } from '../db/transaction'
import {
  schemaLayoutAssignmentOwner,
  syncLayoutAssignmentReference
} from '../utils/layout-assignments'
import { publishSchemaCollectionRoute } from './public-routes'

export async function commitSchemaPublication(args: {
  event: H3Event
  db: Db
  schemaKey: string
  version: number
  previousVersion: number | null
  title: string
  ast: unknown
  jsonSchema: unknown
  uiSchema: unknown
  registry: unknown
  note: string | null
  actorId: string | null
  layoutId: string | null
  now: Date
}) {
  // The immutable version, active pointer, delivery role, route, and normalized
  // Layout reference are one publication decision. D1 executes this callback as
  // a batch; SQLite executes it in a transaction.
  await withDbTransaction(args.event, args.db, async (tx, statements) => {
    await executeDbStatement(tx.insert(schemaTable).values({
      schemaKey: args.schemaKey,
      version: args.version,
      title: args.title,
      astJson: JSON.stringify(args.ast),
      jsonSchema: JSON.stringify(args.jsonSchema),
      uiSchema: JSON.stringify(args.uiSchema),
      registryJson: JSON.stringify(args.registry),
      diffJson: JSON.stringify({ from: args.previousVersion, to: args.version }),
      createdBy: args.actorId,
      createdAt: args.now,
      note: args.note
    }), statements)

    await executeDbStatement(tx.insert(schemaActiveTable).values({
      schemaKey: args.schemaKey,
      activeVersion: args.version,
      updatedAt: args.now
    }).onConflictDoUpdate({
      target: schemaActiveTable.schemaKey,
      set: {
        activeVersion: args.version,
        updatedAt: args.now
      }
    }), statements)

    await executeDbStatement(tx.insert(schemaRoleTable).values({
      schemaKey: args.schemaKey,
      roleKey: 'anonymous',
      canRead: true,
      canWrite: false,
      canAdmin: false
    }).onConflictDoNothing(), statements)

    await publishSchemaCollectionRoute({
      db: tx,
      statements,
      schemaKey: args.schemaKey,
      now: args.now
    })
    await syncLayoutAssignmentReference({
      db: tx,
      statements,
      owner: schemaLayoutAssignmentOwner(args.schemaKey, `published:${args.version}`),
      layoutId: args.layoutId,
      now: args.now
    })
  })
}
