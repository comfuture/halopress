type RegistryField = { fieldId: string; key: string; kind: string; title?: string; system?: boolean }

const rendererByKind: Record<string, string> = {
  string: 'text',
  text: 'long_text',
  number: 'number',
  integer: 'number',
  boolean: 'boolean',
  date: 'date',
  datetime: 'datetime',
  url: 'link',
  enum: 'badge',
  richtext: 'rich_text',
  reference: 'reference',
  asset: 'asset',
  asset_list: 'asset_gallery'
}

export function resolveSchemaPresentation(registry: any) {
  const fields: RegistryField[] = (registry?.fields ?? []).filter((field: RegistryField) => !field.system)
  const stored = registry?.presentation
  if (stored?.contractVersion === 1 && Array.isArray(stored.fields)) return stored

  const find = (kinds: string[], keys: string[]) => fields.find(field => keys.includes(field.key) && kinds.includes(field.kind))
    ?? fields.find(field => kinds.includes(field.kind))
  const slot = (field?: RegistryField) => field ? { fieldId: field.fieldId, fieldKey: field.key } : undefined
  return {
    contractVersion: 1,
    schemaVersion: registry?.version ?? 0,
    preset: 'generic',
    collectionTemplate: 'list',
    detailTemplate: 'document',
    slots: {
      title: slot(find(['string', 'text'], ['title', 'name'])),
      description: slot(find(['string', 'text', 'richtext'], ['description', 'summary', 'excerpt'])),
      image: slot(find(['asset', 'asset_list'], ['image', 'cover', 'thumbnail', 'gallery'])),
      body: slot(find(['text', 'richtext'], ['body', 'content'])),
      gallery: slot(find(['asset_list', 'asset'], ['gallery', 'images', 'media'])),
      price: slot(find(['number', 'integer', 'string'], ['price', 'amount']))
    },
    fields: fields.map(field => ({
      fieldId: field.fieldId,
      fieldKey: field.key,
      kind: field.kind,
      title: field.title,
      renderer: rendererByKind[field.kind] ?? 'text'
    }))
  }
}

export function hasRenderableValue(value: unknown) {
  if (value === null || value === undefined || value === '') return false
  if (Array.isArray(value)) return value.length > 0
  return true
}

export function presentationText(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.map(presentationText).filter(Boolean).join(' ')
  if (value && typeof value === 'object') {
    if (typeof (value as any).text === 'string') return (value as any).text
    if (Array.isArray((value as any).content)) return presentationText((value as any).content)
  }
  return ''
}

export function safePresentationLink(value: unknown) {
  if (typeof value !== 'string') return null
  const candidate = value.trim()
  if (!candidate) return null
  if (candidate.startsWith('/') || candidate.startsWith('#') || candidate.startsWith('?')) return candidate
  try {
    const url = new URL(candidate)
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null
  } catch {
    return null
  }
}

export function formatPresentationDate(value: unknown, includeTime = false, locale = 'en') {
  if (typeof value !== 'string') return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        ...(includeTime ? { timeStyle: 'short' } : {})
      }).format(date)
}
