import { computed, unref } from 'vue'
import type { MaybeRef } from 'vue'
import { convertJsonSchemaToZod } from 'zod-from-json-schema'
import type { HalopressItem } from './useHalopressQuery'

export type HalopressContent<TExtra = Record<string, unknown>> = HalopressItem & {
  extra: TExtra
}

export type HalopressSurroundings = {
  prev: HalopressItem | null
  next: HalopressItem | null
}

export type HalopressContentOptions = {
  id?: MaybeRef<string | number>
  order?: MaybeRef<'asc' | 'desc'>
  status?: MaybeRef<string>
}

type HalopressContentResponse<TExtra = Record<string, unknown>> = HalopressContent<TExtra> & {
  surroundings?: HalopressSurroundings
}

function parseTarget(schemaOrPath: string, id?: string | number | null) {
  const trimmed = schemaOrPath.trim()
  if (trimmed.includes('/')) {
    const [schemaKey, contentId] = trimmed.split('/').filter(Boolean)
    return { schemaKey, contentId }
  }
  return { schemaKey: trimmed, contentId: id != null ? String(id) : '' }
}

export async function useHalopressContent(schemaOrPath: MaybeRef<string>, options: HalopressContentOptions = {}) {
  const target = computed(() => {
    const raw = unref(schemaOrPath)
    return parseTarget(raw == null ? '' : String(raw), unref(options.id))
  })
  const schemaKey = computed(() => target.value.schemaKey)
  const contentId = computed(() => target.value.contentId)

  const query = computed(() => ({
    order: unref(options.order) ?? undefined,
    status: unref(options.status) ?? undefined,
    surroundings: '1'
  }))

  const { data, refresh, pending, error } = await useFetch<HalopressContentResponse>(
    () => `/api/content/${schemaKey.value}/${contentId.value}`,
    { query }
  )

  const { data: schema } = await useFetch<any>(
    () => `/api/schema/${schemaKey.value}/active`
  )

  const schemaZod = computed(() => {
    if (!schema.value?.jsonSchema) return null
    try {
      return convertJsonSchemaToZod(schema.value.jsonSchema)
    } catch (err) {
      if (import.meta.dev) {
        console.warn(`[halopress] Failed to convert jsonSchema for ${schemaKey.value}`, err)
      }
      return null
    }
  })

  const content = computed(() => {
    if (!data.value) return null
    const { surroundings: _surroundings, ...base } = data.value
    if (!base) return null
    const zodSchema = schemaZod.value
    if (!zodSchema) return base
    const result = zodSchema.safeParse(base.extra)
    if (result.success) {
      return { ...base, extra: result.data }
    }
    if (import.meta.dev) {
      console.warn(`[halopress] Content extra failed schema validation for ${schemaKey.value}/${contentId.value}`, result.error)
    }
    return base
  })

  const surroundings = computed(() => data.value?.surroundings ?? { prev: null, next: null })

  return {
    content,
    surroundings,
    schema,
    schemaZod,
    reload: refresh,
    pending,
    error
  }
}
