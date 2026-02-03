export type UiConfig = {
  widget?: string
  placeholder?: string
  help?: string
  rows?: number
  group?: string
  order?: number
  hidden?: boolean
  readonly?: boolean
}

export type SearchConfig = {
  mode?: 'off' | 'exact' | 'range' | 'exact_set'
  filterable?: boolean
  sortable?: boolean
}

export type RelConfig = {
  kind: 'ref' | 'ref_list' | 'poly_ref' | 'asset_ref'
  target: string // system:User | system:Asset | content:SchemaKey
  cardinality: 'one' | 'many'
  editMode?: 'pick' | 'inline_create' | 'inline_edit' | 'embed_snapshot'
  default?: 'currentUser' | 'none'
  picker?: string
  inline?: {
    ui?: string
    createOn?: 'save'
  }
}

export type FieldKind =
  | 'string'
  | 'text'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'url'
  | 'enum'
  | 'richtext'
  | 'reference'
  | 'asset'

export type FieldNode = {
  id: string
  key: string
  kind: FieldKind
  title?: string
  description?: string
  required?: boolean
  default?: unknown
  enumValues?: { label: string; value: string }[]
  ui?: UiConfig
  search?: SearchConfig
  rel?: RelConfig
  system?: boolean
}

export type SchemaAst = {
  schemaKey: string
  title: string
  description?: string
  fields: FieldNode[]
}

export type SchemaRegistry = {
  schemaKey: string
  version: number
  title: string
  fields: Array<{
    fieldId: string
    key: string
    kind: FieldKind
    title?: string
    description?: string
    required?: boolean
    enumValues?: { label: string; value: string }[]
    ui?: UiConfig
    search?: SearchConfig
    rel?: RelConfig
    system?: boolean
  }>
  relations: Array<{
    fieldId: string
    fieldKey: string
    targetKind: 'content' | 'user' | 'asset'
    targetSchemaKey?: string
    kind: RelConfig['kind']
  }>
}
