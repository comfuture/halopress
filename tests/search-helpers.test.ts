import { describe, expect, it } from 'vitest'
import {
  buildSearchDataRecord,
  coerceSearchValue,
  jsonPathForFieldKey,
  normalizeSearchConfig,
  normalizeSearchMode,
  searchDataTypeForKind
} from '../server/cms/search-helpers'

describe('searchDataTypeForKind', () => {
  it('maps field kinds to supported query data types', () => {
    expect(searchDataTypeForKind('string')).toBe('text')
    expect(searchDataTypeForKind('integer')).toBe('integer')
    expect(searchDataTypeForKind('number')).toBe('float')
    expect(searchDataTypeForKind('date')).toBe('date')
    expect(searchDataTypeForKind('asset')).toBeNull()
  })
})

describe('normalizeSearchMode', () => {
  it('drops unsupported modes for a field kind', () => {
    expect(normalizeSearchMode('number', 'exact')).toBe('exact')
    expect(normalizeSearchMode('number', 'exact_set')).toBe('off')
    expect(normalizeSearchMode('richtext', 'exact')).toBe('off')
  })
})

describe('jsonPathForFieldKey', () => {
  it('escapes field keys for sqlite json paths', () => {
    expect(jsonPathForFieldKey('title')).toBe('$."title"')
    expect(jsonPathForFieldKey('hero"image')).toBe('$."hero\\"image"')
  })
})

describe('normalizeSearchConfig', () => {
  it('enables filterable and sortable only when the field kind and mode allow it', () => {
    expect(normalizeSearchConfig({
      fieldId: '1',
      key: 'price',
      kind: 'number',
      search: { mode: 'range', filterable: true, sortable: true }
    })).toEqual({
      mode: 'range',
      filterable: true,
      sortable: true
    })

    expect(normalizeSearchConfig({
      fieldId: '2',
      key: 'cover',
      kind: 'asset',
      search: { mode: 'exact', filterable: true, sortable: true }
    })).toEqual({
      mode: 'off',
      filterable: false,
      sortable: false
    })
  })
})

describe('coerceSearchValue', () => {
  it('coerces primitive values into queryable shapes', () => {
    expect(coerceSearchValue({ kind: 'number' }, '12.5')).toBe(12.5)
    expect(coerceSearchValue({ kind: 'integer' }, '12.9')).toBe(12)
    expect(coerceSearchValue({ kind: 'boolean' }, true)).toBe(1)
    expect(coerceSearchValue({ kind: 'date' }, '2025-01-01')).toBeTypeOf('number')
  })

  it('accepts only configured enum values', () => {
    expect(coerceSearchValue({
      kind: 'enum',
      enumValues: [{ label: 'Draft', value: 'draft' }]
    }, 'draft')).toBe('draft')

    expect(coerceSearchValue({
      kind: 'enum',
      enumValues: [{ label: 'Draft', value: 'draft' }]
    }, 'published')).toBeNull()
  })
})

describe('buildSearchDataRecord', () => {
  it('coerces stored content values into search response values', () => {
    expect(buildSearchDataRecord([
      { key: 'featured', kind: 'boolean' },
      { key: 'publishedAt', kind: 'datetime' },
      { key: 'headline', kind: 'string' }
    ], {
      featured: true,
      publishedAt: '2025-01-01T00:00:00.000Z',
      headline: 'Hello'
    })).toEqual({
      featured: 1,
      publishedAt: 1735689600000,
      headline: 'Hello'
    })
  })
})
