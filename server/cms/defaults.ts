import { ulid } from 'ulid'
import type { SchemaAst } from './types'

export function defaultArticleSchemaAst(): SchemaAst {
  return {
    schemaKey: 'article',
    title: 'Article',
    description: 'Default article schema',
    fields: [
      {
        id: ulid(),
        key: 'body',
        kind: 'richtext',
        title: 'Body',
        required: true,
        ui: { widget: 'u-editor' }
      }
    ]
  }
}

