<script setup lang="ts">
import * as z from 'zod'

const props = defineProps<{
  // Server response shape is tenant/schema dependent; keep flexible for MVP.
  schema: any
  model: Record<string, any>
}>()

function ensureRichtextDoc(fieldKey: string) {
  const v = props.model[fieldKey]
  if (v === null || v === undefined) {
    props.model[fieldKey] = { type: 'doc', content: [{ type: 'paragraph' }] }
    return
  }

  if (typeof v === 'object' && v?.type === 'doc' && Array.isArray(v.content) && v.content.length === 0) {
    props.model[fieldKey] = { type: 'doc', content: [{ type: 'paragraph' }] }
  }
}

watchEffect(() => {
  const fields = props.schema?.registry?.fields
  if (!Array.isArray(fields)) return
  for (const field of fields) {
    if (field?.kind === 'richtext') ensureRichtextDoc(field.key)
  }
})

function enumOptions(fieldKey: string) {
  const astField = (props.schema?.ast?.fields ?? []).find((f: any) => f?.key === fieldKey)
  if (Array.isArray(astField?.enumValues) && astField.enumValues.length) return astField.enumValues

  const field = (props.schema?.registry?.fields ?? []).find((f: any) => f?.key === fieldKey)
  if (Array.isArray(field?.enumValues) && field.enumValues.length) return field.enumValues

  const enums = props.schema?.jsonSchema?.properties?.[fieldKey]?.enum
  if (!Array.isArray(enums)) return []
  return enums.map((v: string) => ({ label: v, value: v }))
}

function enumValues(fieldKey: string) {
  const options = enumOptions(fieldKey)
  return options
    .map((opt: any) => {
      if (typeof opt === 'string') return opt
      if (typeof opt?.value === 'string') return opt.value
      return null
    })
    .filter(Boolean) as string[]
}

function refTargetSchemaKey(field: any) {
  const t = field?.rel?.target as string | undefined
  if (!t) return null
  if (t.startsWith('content:')) return t.slice('content:'.length)
  return null
}

function emptyToUndefined(value: unknown) {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'string' && value.trim() === '') return undefined
  return value
}

function requiredMessage(label: string) {
  return `${label} is required`
}

const formSchema = computed(() => {
  const shape: Record<string, z.ZodTypeAny> = {}
  const fields = props.schema?.registry?.fields ?? []

  for (const field of fields) {
    const label = field.title || field.key
    const required = !!field.required

    if (field.kind === 'string' || field.kind === 'text') {
      shape[field.key] = required
        ? z.string().min(1, requiredMessage(label))
        : z.string().optional().nullable()
      continue
    }

    if (field.kind === 'enum') {
      const values = enumValues(field.key)
      if (required) {
        shape[field.key] = values.length
          ? z.string().refine(v => values.includes(v), { message: `Select ${label}` })
          : z.string().min(1, requiredMessage(label))
      } else {
        shape[field.key] = values.length
          ? z.string().optional().nullable().refine(v => !v || values.includes(v), { message: `Select ${label}` })
          : z.string().optional().nullable()
      }
      continue
    }

    if (field.kind === 'number' || field.kind === 'integer') {
      const base = z.preprocess(
        emptyToUndefined,
        field.kind === 'integer'
          ? z.coerce.number().int(`${label} must be an integer`)
          : z.coerce.number()
      )
      shape[field.key] = required ? base : base.optional().nullable()
      continue
    }

    if (field.kind === 'boolean') {
      shape[field.key] = required ? z.boolean() : z.boolean().optional()
      continue
    }

    if (field.kind === 'date') {
      shape[field.key] = required
        ? z.string().min(1, requiredMessage(label))
        : z.string().optional().nullable()
      continue
    }

    if (field.kind === 'datetime') {
      shape[field.key] = required
        ? z.string().min(1, requiredMessage(label))
        : z.string().optional().nullable()
      continue
    }

    if (field.kind === 'url') {
      const base = z.preprocess(emptyToUndefined, z.string().url(`Invalid ${label}`))
      shape[field.key] = required ? base : base.optional().nullable()
      continue
    }

    if (field.kind === 'asset' || field.kind === 'reference') {
      shape[field.key] = required
        ? z.string().min(1, requiredMessage(label))
        : z.string().optional().nullable()
      continue
    }

    if (field.kind === 'richtext') {
      const base = z.any().refine(value => value && typeof value === 'object', { message: requiredMessage(label) })
      shape[field.key] = required ? base : z.any().optional().nullable()
      continue
    }

    shape[field.key] = required ? z.any() : z.any().optional().nullable()
  }

  return z.object(shape)
})

const formRef = ref<any>(null)

async function validateForm() {
  if (!formRef.value?.validate) return true
  try {
    await formRef.value.validate()
    return true
  } catch {
    return false
  }
}

defineExpose({
  validate: validateForm
})
</script>

<template>
  <UForm
    ref="formRef"
    :schema="formSchema"
    :state="model"
    class="flex flex-col gap-4"
  >
    <UFormField
      v-for="field in schema.registry.fields"
      :key="field.fieldId"
      :label="field.title || field.key"
      :name="field.key"
      :required="!!field.required"
      class="w-full"
    >
      <UInput
        v-if="field.kind === 'string'"
        v-model="model[field.key]"
        :placeholder="field.ui?.placeholder"
        class="w-full"
      />

      <UTextarea
        v-else-if="field.kind === 'text'"
        v-model="model[field.key]"
        :rows="field.ui?.rows || 4"
        :placeholder="field.ui?.placeholder"
        class="w-full"
      />

      <USelectMenu
        v-else-if="field.kind === 'enum'"
        v-model="model[field.key]"
        :items="enumOptions(field.key)"
        value-key="value"
        :placeholder="field.ui?.placeholder || 'Select…'"
        class="w-full sm:min-w-72"
      />

      <UInput
        v-else-if="field.kind === 'number'"
        v-model="model[field.key]"
        type="number"
        inputmode="decimal"
        step="any"
        class="w-full"
      />

      <UInput
        v-else-if="field.kind === 'integer'"
        v-model="model[field.key]"
        type="number"
        inputmode="numeric"
        step="1"
        class="w-full"
      />

      <USwitch
        v-else-if="field.kind === 'boolean'"
        v-model="model[field.key]"
      />

      <UInput
        v-else-if="field.kind === 'date'"
        v-model="model[field.key]"
        type="date"
        class="w-full"
      />

      <UInput
        v-else-if="field.kind === 'datetime'"
        v-model="model[field.key]"
        type="datetime-local"
        class="w-full"
      />

      <UInput
        v-else-if="field.kind === 'url'"
        v-model="model[field.key]"
        type="url"
        :placeholder="field.ui?.placeholder || 'https://'"
        class="w-full"
      />

      <CmsRichEditor
        v-else-if="field.kind === 'richtext'"
        v-model="model[field.key]"
        :placeholder="field.ui?.placeholder || 'Write…'"
        class="w-full min-h-48"
      />

      <CmsAssetPicker
        v-else-if="field.kind === 'asset'"
        v-model="model[field.key]"
        :label="field.title || field.key"
      />

      <CmsReferencePicker
        v-else-if="field.kind === 'reference'"
        v-model="model[field.key]"
        :label="field.title || field.key"
        :target-schema-key="refTargetSchemaKey(field)"
      />

      <UInput
        v-else
        v-model="model[field.key]"
        class="w-full"
      />
    </UFormField>
  </UForm>
</template>
