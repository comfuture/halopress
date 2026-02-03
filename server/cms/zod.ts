import { z } from 'zod'

const uiConfig = z.object({
  widget: z.string().optional(),
  placeholder: z.string().optional(),
  help: z.string().optional(),
  rows: z.number().int().positive().optional(),
  group: z.string().optional(),
  order: z.number().int().optional(),
  hidden: z.boolean().optional(),
  readonly: z.boolean().optional()
}).strict()

const searchConfig = z.object({
  mode: z.enum(['off', 'exact', 'range', 'exact_set']).optional(),
  filterable: z.boolean().optional(),
  sortable: z.boolean().optional()
}).strict()

const relConfig = z.object({
  kind: z.enum(['ref', 'ref_list', 'poly_ref', 'asset_ref']),
  target: z.string(),
  cardinality: z.enum(['one', 'many']),
  editMode: z.enum(['pick', 'inline_create', 'inline_edit', 'embed_snapshot']).optional(),
  default: z.enum(['currentUser', 'none']).optional(),
  picker: z.string().optional(),
  inline: z.object({
    ui: z.string().optional(),
    createOn: z.enum(['save']).optional()
  }).strict().optional()
}).strict()

const fieldKind = z.enum([
  'string',
  'text',
  'number',
  'integer',
  'boolean',
  'date',
  'datetime',
  'url',
  'enum',
  'richtext',
  'reference',
  'asset'
])

export const fieldNodeSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
  kind: fieldKind,
  title: z.string().optional(),
  description: z.string().optional(),
  required: z.boolean().optional(),
  default: z.unknown().optional(),
  enumValues: z.array(z.object({ label: z.string(), value: z.string() }).strict()).optional(),
  ui: uiConfig.optional(),
  search: searchConfig.optional(),
  rel: relConfig.optional(),
  system: z.boolean().optional()
}).strict()

export const schemaAstSchema = z.object({
  schemaKey: z.string().min(1).regex(/^[a-z0-9][a-z0-9_]*$/),
  title: z.string().min(1),
  description: z.string().optional(),
  fields: z.array(fieldNodeSchema)
}).strict()
