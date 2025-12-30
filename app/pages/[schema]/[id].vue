<script setup lang="ts">
const route = useRoute()
const schemaKey = computed(() => String(route.params.schema))
const id = computed(() => String(route.params.id))

const { content: doc, schema } = await useHalopressContent(schemaKey, { id })

const fields = computed(() => schema.value?.registry?.fields ?? [])

type TocLink = { label: string; to: string }

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

function extractText(node: any): string {
  if (!node) return ''
  if (node.type === 'text') return String(node.text ?? '')
  if (Array.isArray(node.content)) return node.content.map(extractText).join('')
  return ''
}

function patchRichText(docJson: any, usedIds: Map<string, number>, toc: TocLink[]) {
  if (!docJson || typeof docJson !== 'object') return docJson

  const patchNode = (node: any): any => {
    if (!node || typeof node !== 'object') return node
    const nextContent = Array.isArray(node.content) ? node.content.map(patchNode) : node.content
    const nextNode = { ...node, ...(nextContent ? { content: nextContent } : {}) }

    if (node.type === 'heading') {
      const text = extractText(node).trim()
      if (text) {
        const base = (node.attrs?.id as string) || slugify(text) || 'section'
        const count = usedIds.get(base) ?? 0
        const idValue = count > 0 ? `${base}-${count + 1}` : base
        usedIds.set(base, count + 1)
        nextNode.attrs = { ...(node.attrs ?? {}), id: idValue }
        toc.push({ label: text, to: `#${idValue}` })
      }
    }

    return nextNode
  }

  return patchNode(docJson)
}

const richtextMeta = computed(() => {
  const extra = doc.value?.extra ?? null
  if (!extra || typeof extra !== 'object') {
    return { extra: extra ?? null, toc: [] as TocLink[] }
  }

  const usedIds = new Map<string, number>()
  const toc: TocLink[] = []
  const patchedExtra = { ...extra }

  for (const field of fields.value) {
    if (field.kind !== 'richtext') continue
    if (!extra[field.key]) continue
    patchedExtra[field.key] = patchRichText(extra[field.key], usedIds, toc)
  }

  return { extra: patchedExtra, toc }
})

const renderedExtra = computed(() => richtextMeta.value.extra ?? null)
const tocLinks = computed(() => richtextMeta.value.toc)
</script>

<template>
  <UContainer>
    <UPage class="space-y-8">
      <template v-if="tocLinks.length" #right>
        <UPageAside>
          <UPageLinks title="On this page" :links="tocLinks" />
        </UPageAside>
      </template>

      <UPageHeader
        :title="doc?.title || doc?.id || id"
        :description="schema ? `${schemaKey} · v${schema.version}` : schemaKey"
      />

      <UPageBody>
        <UPageSection title="Content fields" description="Structured data rendered from the schema registry.">
          <template v-if="fields.length && renderedExtra">
            <UPageList divide>
              <div
                v-for="field in fields"
                :key="field.fieldId"
                :id="`field-${field.fieldId || field.key}`"
                class="py-1"
              >
                <UPageCard
                  :title="field.title || field.key"
                  :description="field.kind"
                  variant="subtle"
                >
                  <template #body>
                    <div v-if="field.kind === 'richtext'">
                      <ClientOnly>
                        <UEditor
                          :model-value="renderedExtra[field.key]"
                          content-type="json"
                          :editable="false"
                          class="w-full min-h-24"
                        />
                        <template #fallback>
                          <USkeleton class="h-24 w-full" />
                        </template>
                      </ClientOnly>
                    </div>

                    <div v-else-if="field.kind === 'asset' && renderedExtra[field.key]">
                      <NuxtImg
                        class="max-w-full rounded-md border border-muted"
                        :src="`/assets/${renderedExtra[field.key]}/raw`"
                        alt=""
                        preset="content"
                      />
                    </div>

                    <div v-else>
                      <pre class="text-sm rounded-md border border-muted bg-muted/50 p-3 overflow-x-auto">{{ renderedExtra[field.key] }}</pre>
                    </div>
                  </template>
                </UPageCard>
              </div>
            </UPageList>
          </template>

          <UAlert
            v-else
            title="Unable to render"
            description="Schema or content is missing."
            icon="i-lucide-alert-triangle"
            variant="subtle"
          />
        </UPageSection>
      </UPageBody>
    </UPage>
  </UContainer>
</template>
