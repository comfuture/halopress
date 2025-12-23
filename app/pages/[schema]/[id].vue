<script setup lang="ts">
const route = useRoute()
const schemaKey = computed(() => String(route.params.schema))
const id = computed(() => String(route.params.id))

const { data: schema } = await useFetch<any>(() => `/api/schema/${schemaKey.value}/active`)
const { data: doc } = await useFetch<any>(() => `/api/content/${schemaKey.value}/${id.value}`)
</script>

<template>
  <div class="space-y-6">
    <UPageHeader
      :title="doc?.title || doc?.id || id"
      :description="schema ? `${schemaKey} • v${schema.version}` : schemaKey"
    />

    <div class="space-y-6">
      <template v-if="schema?.registry && doc?.extra">
        <div
          v-for="field in schema.registry.fields"
          :key="field.fieldId"
          class="space-y-2"
        >
          <h3 class="text-sm font-medium text-muted">
            {{ field.title || field.key }}
          </h3>

          <div v-if="field.kind === 'richtext'">
            <ClientOnly>
              <UEditor
                :model-value="doc.extra[field.key]"
                content-type="json"
                :editable="false"
                class="w-full min-h-24"
              />
              <template #fallback>
                <USkeleton class="h-24 w-full" />
              </template>
            </ClientOnly>
          </div>

          <div v-else-if="field.kind === 'asset' && doc.extra[field.key]">
            <NuxtImg
              class="max-w-full rounded-md border border-muted"
              :src="`/assets/${doc.extra[field.key]}/raw`"
              alt=""
              preset="content"
            />
          </div>

          <div v-else>
            <pre class="text-sm rounded-md border border-muted bg-muted/50 p-3 overflow-x-auto">{{ doc.extra[field.key] }}</pre>
          </div>
        </div>
      </template>

      <UAlert
        v-else
        title="Unable to render"
        description="Schema or content is missing."
        icon="i-lucide-alert-triangle"
        variant="subtle"
      />
    </div>
  </div>
</template>
