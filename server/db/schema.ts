import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const userRole = sqliteTable('user_role', {
  roleKey: text('role_key').notNull(),
  title: text('title'),
  level: integer('level').notNull().default(50)
}, t => ({
  pk: primaryKey({ columns: [t.roleKey] })
}))

export const user = sqliteTable('user', {
  id: text('id').notNull(),
  email: text('email').notNull(),
  name: text('name'),
  roleKey: text('role_key').notNull().default('user').references(() => userRole.roleKey),
  passwordHash: text('password_hash'),
  passwordSalt: text('password_salt'),
  status: text('status').notNull().default('active'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
}, t => ({
  pk: primaryKey({ columns: [t.id] }),
  byEmail: index('idx_user_email').on(t.email)
}))

export const settings = sqliteTable('settings', {
  scope: text('scope').notNull().default('global'),
  key: text('key').notNull(),
  value: text('value').notNull(),
  valueType: text('value_type').notNull().default('string'),
  isEncrypted: integer('is_encrypted', { mode: 'boolean' }).notNull().default(false),
  groupKey: text('group_key'),
  updatedBy: text('updated_by'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  note: text('note')
}, t => ({
  pk: primaryKey({ columns: [t.scope, t.key] }),
  byKey: index('idx_settings_key').on(t.key),
  byGroup: index('idx_settings_group').on(t.groupKey)
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

export const schemaRole = sqliteTable('schema_role', {
  schemaKey: text('schema_key').notNull(),
  roleKey: text('role_key').notNull().references(() => userRole.roleKey),
  canRead: integer('can_read', { mode: 'boolean' }).notNull().default(false),
  canWrite: integer('can_write', { mode: 'boolean' }).notNull().default(false),
  canAdmin: integer('can_admin', { mode: 'boolean' }).notNull().default(false)
}, t => ({
  pk: primaryKey({ columns: [t.schemaKey, t.roleKey] }),
  bySchema: index('idx_schema_role_schema').on(t.schemaKey),
  byRole: index('idx_schema_role_role').on(t.roleKey)
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

export const contentItems = sqliteTable('content_items', {
  contentId: text('content_id').notNull(),
  schemaKey: text('schema_key').notNull(),
  schemaVersion: integer('schema_version').notNull(),
  title: text('title'),
  description: text('description'),
  image: text('image'),
  status: text('status').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
}, t => ({
  pk: primaryKey({ columns: [t.contentId] }),
  bySchemaUpdated: index('idx_content_items_schema_updated').on(t.schemaKey, t.updatedAt),
  byStatus: index('idx_content_items_status').on(t.schemaKey, t.status, t.updatedAt)
}))

export const contentSearchConfig = sqliteTable('content_search_config', {
  schemaKey: text('schema_key').notNull(),
  fieldId: text('field_id').notNull(),
  fieldKey: text('field_key').notNull(),
  kind: text('kind').notNull(),
  searchMode: text('search_mode').notNull().default('off'),
  filterable: integer('filterable', { mode: 'boolean' }).notNull().default(false),
  sortable: integer('sortable', { mode: 'boolean' }).notNull().default(false)
}, t => ({
  pk: primaryKey({ columns: [t.schemaKey, t.fieldId] }),
  bySchema: index('idx_content_search_config_schema').on(t.schemaKey),
  byFieldKey: index('idx_content_search_config_key').on(t.schemaKey, t.fieldKey)
}))

export const contentSearchData = sqliteTable('content_search_data', {
  contentId: text('content_id').notNull(),
  fieldId: text('field_id').notNull(),
  dataType: text('data_type').notNull(),
  text: text('text'),
  value: real('value')
}, t => ({
  pk: primaryKey({ columns: [t.contentId, t.fieldId] }),
  idxFilterText: index('idx_filter_content_search_text').on(t.fieldId, t.dataType, t.text, t.contentId),
  idxFilterValue: index('idx_filter_content_search_value').on(t.fieldId, t.dataType, t.value, t.contentId)
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
