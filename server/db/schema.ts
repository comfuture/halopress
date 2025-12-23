import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const user = sqliteTable('user', {
  id: text('id').notNull(),
  email: text('email').notNull(),
  name: text('name'),
  status: text('status').notNull().default('active'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
}, t => ({
  pk: primaryKey({ columns: [t.id] }),
  byEmail: index('idx_user_email').on(t.email)
}))

export const member = sqliteTable('member', {
  userId: text('user_id').notNull(),
  role: text('role').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
}, t => ({
  pk: primaryKey({ columns: [t.userId] })
}))

export const schema = sqliteTable('schema', {
  schemaKey: text('schema_key').notNull(),
  version: integer('version').notNull(),
  title: text('title'),
  astJson: text('ast_json').notNull(), // JSON string
  jsonSchema: text('json_schema').notNull(), // JSON string
  uiSchema: text('ui_schema'),
  registryJson: text('registry_json'),
  diffJson: text('diff_json'),
  createdBy: text('created_by'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  note: text('note')
}, t => ({
  pk: primaryKey({ columns: [t.schemaKey, t.version] }),
  byCreatedAt: index('idx_schema_created_at').on(t.createdAt)
}))

export const schemaActive = sqliteTable('schema_active', {
  schemaKey: text('schema_key').notNull(),
  activeVersion: integer('active_version').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
}, t => ({
  pk: primaryKey({ columns: [t.schemaKey] })
}))

export const schemaDraft = sqliteTable('schema_draft', {
  schemaKey: text('schema_key').notNull(),
  title: text('title'),
  astJson: text('ast_json').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  lockedBy: text('locked_by'),
  lockExpiresAt: integer('lock_expires_at', { mode: 'timestamp' })
}, t => ({
  pk: primaryKey({ columns: [t.schemaKey] })
}))

export const content = sqliteTable('content', {
  id: text('id').notNull(),
  schemaKey: text('schema_key').notNull(),
  schemaVersion: integer('schema_version').notNull(),
  title: text('title'),
  status: text('status').notNull(),
  extraJson: text('extra_json').notNull(),
  createdBy: text('created_by'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
}, t => ({
  pk: primaryKey({ columns: [t.id] }),
  bySchemaUpdated: index('idx_content_schema_updated').on(t.schemaKey, t.updatedAt),
  byStatus: index('idx_content_status').on(t.schemaKey, t.status, t.updatedAt)
}))

export const contentRef = sqliteTable('content_ref', {
  contentId: text('content_id').notNull(),
  fieldPath: text('field_path').notNull(),
  targetKind: text('target_kind').notNull(), // content|user|asset
  targetSchemaKey: text('target_schema_key'),
  targetId: text('target_id').notNull()
}, t => ({
  pk: primaryKey({ columns: [t.contentId, t.fieldPath, t.targetKind, t.targetId] }),
  byTarget: index('idx_content_ref_target').on(t.targetKind, t.targetId),
  byContent: index('idx_content_ref_content').on(t.contentId)
}))

export const contentRefList = sqliteTable('content_ref_list', {
  ownerContentId: text('owner_content_id').notNull(),
  fieldKey: text('field_key').notNull(),
  position: integer('position').notNull(),
  itemKind: text('item_kind').notNull(), // content|user|asset
  itemSchemaKey: text('item_schema_key'),
  itemId: text('item_id'),
  assetId: text('asset_id'),
  metaJson: text('meta_json')
}, t => ({
  pk: primaryKey({ columns: [t.ownerContentId, t.fieldKey, t.position] }),
  byOwner: index('idx_content_ref_list_owner').on(t.ownerContentId, t.fieldKey)
}))

export const asset = sqliteTable('asset', {
  id: text('id').notNull(),
  kind: text('kind').notNull(), // image|file|video
  status: text('status').notNull(), // uploading|ready
  objectKey: text('object_key').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  sha256: text('sha256'),
  width: integer('width'),
  height: integer('height'),
  durationMs: integer('duration_ms'),
  createdBy: text('created_by'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
}, t => ({
  pk: primaryKey({ columns: [t.id] }),
  byCreatedAt: index('idx_asset_created_at').on(t.createdAt)
}))

export const assetVariant = sqliteTable('asset_variant', {
  assetId: text('asset_id').notNull(),
  variantKey: text('variant_key').notNull(),
  objectKey: text('object_key').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  width: integer('width'),
  height: integer('height'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
}, t => ({
  pk: primaryKey({ columns: [t.assetId, t.variantKey] })
}))

