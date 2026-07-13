export const PUBLIC_PAGE_ROUTE_PREFIX = 'p'

export const RESERVED_SCHEMA_KEYS = new Set([PUBLIC_PAGE_ROUTE_PREFIX])

export function isReservedSchemaKey(key: string) {
  return RESERVED_SCHEMA_KEYS.has(key)
}
