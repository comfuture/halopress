import type {
  CompiledSchemaPresentation,
  FieldKind,
  FieldRendererKey,
  PresentationSlot,
  SchemaAst
} from './types'

export const DEFAULT_RENDERER_BY_KIND: Record<FieldKind, FieldRendererKey> = {
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

const ALLOWED_RENDERERS: Record<FieldKind, FieldRendererKey[]> = {
  string: ['text', 'long_text', 'badge', 'link'],
  text: ['text', 'long_text'],
  number: ['number', 'text'],
  integer: ['number', 'text'],
  boolean: ['boolean', 'badge', 'text'],
  date: ['date', 'text'],
  datetime: ['datetime', 'date', 'text'],
  url: ['link', 'text'],
  enum: ['badge', 'text'],
  richtext: ['rich_text', 'long_text'],
  reference: ['reference', 'reference_list'],
  asset: ['asset'],
  asset_list: ['asset_gallery']
}

const SLOT_KINDS: Record<PresentationSlot, FieldKind[]> = {
  title: ['string', 'text'],
  description: ['string', 'text', 'richtext'],
  image: ['asset', 'asset_list'],
  body: ['text', 'richtext'],
  gallery: ['asset_list', 'asset'],
  price: ['number', 'integer', 'string']
}

function findField(ast: SchemaAst, keys: string[], kinds: FieldKind[]) {
  return ast.fields.find(field => !field.system && keys.includes(field.key) && kinds.includes(field.kind))
    ?? ast.fields.find(field => !field.system && kinds.includes(field.kind))
}

function inferredSlots(ast: SchemaAst) {
  const title = findField(ast, ['title', 'name'], SLOT_KINDS.title)
  const description = findField(ast, ['description', 'summary', 'excerpt'], SLOT_KINDS.description)
  const image = findField(ast, ['image', 'cover', 'thumbnail'], SLOT_KINDS.image)
  const body = findField(ast, ['body', 'content'], SLOT_KINDS.body)
  const gallery = findField(ast, ['gallery', 'images', 'media'], SLOT_KINDS.gallery)
  const price = findField(ast, ['price', 'amount'], SLOT_KINDS.price)
  return Object.fromEntries(Object.entries({ title, description, image, body, gallery, price })
    .filter((entry): entry is [PresentationSlot, NonNullable<typeof title>] => Boolean(entry[1]))
    .map(([slot, field]) => [slot, field.id])) as Partial<Record<PresentationSlot, string>>
}

export function compileSchemaPresentation(ast: SchemaAst, schemaVersion: number): CompiledSchemaPresentation {
  const config = ast.presentation ?? {
    contractVersion: 1 as const,
    preset: 'generic' as const,
    collectionTemplate: 'list' as const,
    detailTemplate: 'document' as const
  }
  const fieldsById = new Map(ast.fields.filter(field => !field.system).map(field => [field.id, field]))
  const slots = { ...inferredSlots(ast), ...config.slots }
  const compiledSlots: CompiledSchemaPresentation['slots'] = {}

  for (const [slot, fieldId] of Object.entries(slots) as Array<[PresentationSlot, string]>) {
    const field = fieldsById.get(fieldId)
    if (!field) throw new Error(`Presentation ${slot} binding references a missing field`)
    if (!SLOT_KINDS[slot].includes(field.kind)) {
      throw new Error(`Presentation ${slot} binding does not support ${field.kind}`)
    }
    compiledSlots[slot] = { fieldId, fieldKey: field.key }
  }

  const overrides = new Map(config.renderers?.map(item => [item.fieldId, item.renderer]))
  for (const fieldId of overrides.keys()) {
    if (!fieldsById.has(fieldId)) throw new Error('Presentation renderer references a missing field')
  }

  const fields = [...fieldsById.values()].map((field) => {
    const renderer = overrides.get(field.id) ?? DEFAULT_RENDERER_BY_KIND[field.kind]
    if (!ALLOWED_RENDERERS[field.kind].includes(renderer)) {
      throw new Error(`Presentation renderer ${renderer} does not support ${field.kind}`)
    }
    return {
      fieldId: field.id,
      fieldKey: field.key,
      kind: field.kind,
      renderer,
      title: field.title
    }
  })

  return {
    contractVersion: 1,
    schemaVersion,
    preset: config.preset,
    collectionTemplate: config.collectionTemplate,
    detailTemplate: config.detailTemplate,
    slots: compiledSlots,
    fields
  }
}
