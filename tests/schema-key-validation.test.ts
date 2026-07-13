import { describe, expect, it } from 'vitest'

import { schemaAstSchema } from '../server/cms/zod'
import { isReservedSchemaKey, PUBLIC_PAGE_ROUTE_PREFIX } from '../shared/public-routing'

describe('schema key routing constraints', () => {
  it('reserves the singular public page prefix', () => {
    expect(PUBLIC_PAGE_ROUTE_PREFIX).toBe('p')
    expect(isReservedSchemaKey('p')).toBe(true)
    expect(schemaAstSchema.safeParse({
      schemaKey: 'p',
      title: 'Conflicting schema',
      fields: []
    }).success).toBe(false)
  })

  it('continues to accept ordinary schema keys', () => {
    expect(schemaAstSchema.safeParse({
      schemaKey: 'article',
      title: 'Article',
      fields: []
    }).success).toBe(true)
  })
})
