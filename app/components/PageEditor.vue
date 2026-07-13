<script setup lang="ts">
import type { Editor, JSONContent } from '@tiptap/vue-3'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import { markRaw, nextTick } from 'vue'

import PageBlock from '~/editor/page/PageBlock'
import PageBlockNodeView from '~/editor/page/PageBlockNodeView.vue'
import ImageUpload from '~/editor/RichEditorImageUpload'
import RichEditorImageUploadNode from '~/editor/RichEditorImageUploadNode.vue'
import { pageBlockRegistry, getPageBlockComponent } from '~/editor/page/registry'
import type { PageBlockAttrs, PageBlockComponentKey, PageBlockField } from '~/editor/page/types'
import { createPageProfile } from '~/editor/profiles'
import type { EditorProfileCustomization } from '~/editor/profiles'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  modelValue: JSONContent | null
  editable?: boolean
  profile?: EditorProfileCustomization
}>(), {
  modelValue: null,
  editable: true,
  profile: () => ({})
})

const emit = defineEmits<{
  'update:modelValue': [value: JSONContent | null]
}>()

const value = computed({
  get: () => props.modelValue,
  set: (nextValue) => emit('update:modelValue', nextValue)
})

const PageBlockEditor = PageBlock.extend({
  addNodeView() {
    return VueNodeViewRenderer(PageBlockNodeView)
  }
})
const ImageUploadEditor = ImageUpload.extend({
  addNodeView() {
    return VueNodeViewRenderer(RichEditorImageUploadNode)
  }
})
const editorProfile = createPageProfile(props.profile, {
  pageBlockFactory: () => PageBlockEditor.configure({}),
  imageUploadFactory: () => ImageUploadEditor.configure({})
})
const extensions = markRaw(editorProfile.extensions.map(extension => markRaw(extension)))

const editorRef = ref<any>(null)

const selectedBlock = ref<{ pos: number; attrs: PageBlockAttrs } | null>(null)
const editing = reactive<PageBlockAttrs>({
  component: 'pageHero',
  props: {},
  advanced: {},
  media: { url: '', alt: '' }
})

const jsonBuffers = reactive<Record<string, string>>({
  links: '[]',
  ui: '{}',
  advanced: '{}'
})

const jsonErrors = reactive<Record<string, string | null>>({
  links: null,
  ui: null,
  advanced: null
})

const syncing = ref(false)

const activeComponent = computed(() => getPageBlockComponent(selectedBlock.value?.attrs.component))
const activeFields = computed<PageBlockField[]>(() => activeComponent.value?.fields ?? [])

function normalizeJson(value: unknown, fallback: string) {
  try {
    if (value == null) return fallback
    return JSON.stringify(value, null, 2)
  } catch {
    return fallback
  }
}

function setEditingFromSelection(next: PageBlockAttrs) {
  syncing.value = true
  editing.component = next.component
  editing.props = { ...next.props }
  editing.advanced = { ...next.advanced }
  editing.media = { ...next.media }

  jsonBuffers.links = normalizeJson(editing.props.links, '[]')
  jsonBuffers.ui = normalizeJson(editing.props.ui, '{}')
  jsonBuffers.advanced = normalizeJson(editing.advanced, '{}')

  jsonErrors.links = null
  jsonErrors.ui = null
  jsonErrors.advanced = null

  nextTick(() => {
    syncing.value = false
  })
}

function syncSelection(editor: Editor) {
  const selection: any = editor.state.selection
  const node = selection?.node

  if (node?.type?.name === 'pageBlock') {
    selectedBlock.value = {
      pos: selection.from,
      attrs: node.attrs as PageBlockAttrs
    }
    setEditingFromSelection(node.attrs as PageBlockAttrs)
    return
  }

  selectedBlock.value = null
}

function insertBlock(editor: Editor, key: PageBlockComponentKey) {
  const entry = pageBlockRegistry.byKey[key]
  if (!entry) return

  const attrs: PageBlockAttrs = {
    component: entry.key,
    props: { ...entry.defaultProps },
    advanced: {},
    media: { ...entry.defaultMedia }
  }

  editor
    .chain()
    .focus()
    .insertPageBlock(attrs)
    .run()
}

function getEditor() {
  return (editorRef.value?.editor ?? null) as Editor | null
}

function handleInsertBlock(key: PageBlockComponentKey) {
  const editor = getEditor()
  if (!editor) return
  insertBlock(editor, key)
}

function applyJsonField(fieldKey: 'links' | 'ui' | 'advanced') {
  if (syncing.value) return
  const raw = jsonBuffers[fieldKey]
  try {
    const parsed = raw ? JSON.parse(raw) : (fieldKey === 'links' ? [] : {})
    jsonErrors[fieldKey] = null
    if (fieldKey === 'advanced') {
      editing.advanced = parsed
    } else {
      editing.props = { ...editing.props, [fieldKey]: parsed }
    }
  } catch {
    jsonErrors[fieldKey] = 'Invalid JSON'
  }
}

watch(() => jsonBuffers.links, () => applyJsonField('links'))
watch(() => jsonBuffers.ui, () => applyJsonField('ui'))
watch(() => jsonBuffers.advanced, () => applyJsonField('advanced'))

watch(editing, () => {
  if (syncing.value || !selectedBlock.value) return
  const editor = getEditor()
  if (!editor) return

  const nextAttrs: PageBlockAttrs = {
    component: editing.component,
    props: { ...editing.props },
    advanced: { ...editing.advanced },
    media: { ...editing.media }
  }

  editor
    .chain()
    .focus()
    .setNodeSelection(selectedBlock.value.pos)
    .updateAttributes('pageBlock', nextAttrs)
    .run()
}, { deep: true })

watch(getEditor, (editor, _prev, onCleanup) => {
  if (!editor) return
  const handler = () => syncSelection(editor)
  editor.on('selectionUpdate', handler)
  editor.on('update', handler)
  onCleanup(() => {
    editor.off('selectionUpdate', handler)
    editor.off('update', handler)
  })
}, { immediate: true })
</script>

<template>
  <div class="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
    <div class="min-w-0">
      <UEditor
        ref="editorRef"
        v-model="value"
        content-type="json"
        :extensions="extensions"
        :editable="editable"
        class="w-full min-h-[60vh] rounded-md border border-muted bg-default"
        :style="{ borderRadius: 'var(--ui-radius)' }"
        :ui="{ base: 'px-4 py-3' }"
      >
        <div class="text-xs text-muted px-2 py-1">Select a block to edit its properties.</div>
      </UEditor>
    </div>

    <div class="flex flex-col gap-6">
      <section aria-labelledby="page-editor-insert-blocks" class="space-y-3">
        <h2 id="page-editor-insert-blocks" class="text-sm font-semibold">
          Insert Blocks
        </h2>
        <div class="flex flex-col gap-2">
          <UButton
            v-for="item in pageBlockRegistry.components"
            :key="item.key"
            color="neutral"
            variant="soft"
            @click="handleInsertBlock(item.key)"
          >
            {{ item.label }}
          </UButton>
        </div>
      </section>

      <section aria-labelledby="page-editor-properties" class="space-y-4">
        <h2 id="page-editor-properties" class="text-sm font-semibold">
          Properties
        </h2>

        <div v-if="!selectedBlock" class="text-sm text-muted">
          Select a block to edit its properties.
        </div>

        <template v-else>
          <fieldset class="m-0 min-w-0 space-y-3 border-0 p-0">
            <legend class="mb-3 text-xs font-medium text-muted">
              Media
            </legend>
            <UFormField label="Image URL">
              <UInput v-model="editing.media.url" placeholder="https://" class="w-full" />
            </UFormField>
            <UFormField label="Image Alt">
              <UInput v-model="editing.media.alt" placeholder="Alt text" class="w-full" />
            </UFormField>
          </fieldset>

          <fieldset class="m-0 min-w-0 space-y-3 border-0 p-0">
            <legend class="mb-3 text-xs font-medium text-muted">
              {{ activeComponent?.label || 'Component' }}
            </legend>
            <div v-for="field in activeFields" :key="field.key">
              <UFormField :label="field.label" :help="field.help">
                <UInput
                  v-if="field.type === 'text'"
                  v-model="editing.props[field.key]"
                  :placeholder="field.placeholder"
                  class="w-full"
                />
                <UInput
                  v-else-if="field.type === 'url'"
                  v-model="editing.props[field.key]"
                  type="url"
                  :placeholder="field.placeholder || 'https://'"
                  class="w-full"
                />
                <UTextarea
                  v-else-if="field.type === 'textarea'"
                  v-model="editing.props[field.key]"
                  :placeholder="field.placeholder"
                  class="w-full"
                />
                <USelect
                  v-else-if="field.type === 'select'"
                  v-model="editing.props[field.key]"
                  :items="field.options || []"
                  class="w-full"
                />
                <USwitch
                  v-else-if="field.type === 'boolean'"
                  v-model="editing.props[field.key]"
                />
                <div v-else-if="field.type === 'json'" class="space-y-1">
                  <UTextarea
                    v-model="jsonBuffers[field.key]"
                    class="w-full font-mono text-xs"
                    placeholder="{}"
                    :rows="6"
                  />
                  <p v-if="jsonErrors[field.key]" class="text-xs text-error">
                    {{ jsonErrors[field.key] }}
                  </p>
                </div>
              </UFormField>
            </div>
          </fieldset>

          <fieldset class="m-0 min-w-0 space-y-3 border-0 p-0">
            <legend class="mb-3 text-xs font-medium text-muted">
              Advanced
            </legend>
            <UFormField label="Props (JSON)" help="Merged last, overrides other props.">
              <UTextarea
                v-model="jsonBuffers.advanced"
                class="w-full font-mono text-xs"
                placeholder="{}"
                :rows="6"
              />
              <p v-if="jsonErrors.advanced" class="text-xs text-error">
                {{ jsonErrors.advanced }}
              </p>
            </UFormField>
          </fieldset>
        </template>
      </section>
    </div>
  </div>
</template>
