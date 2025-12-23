<script setup lang="ts">
import type {
  DropdownMenuItem,
  EditorSuggestionMenuItem,
  EditorToolbarItem,
  EditorCustomHandlers
} from '@nuxt/ui'
import type { Editor, JSONContent } from '@tiptap/vue-3'
import { mapEditorItems } from '@nuxt/ui/utils/editor'
import { markRaw } from 'vue'
import TextAlign from '@tiptap/extension-text-align'
import ImageUpload from '~/editor/RichEditorImageUpload'
import RichEditorLinkPopover from './RichEditorLinkPopover.vue'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  modelValue: any
  placeholder?: string
  editable?: boolean
}>(), {
  placeholder: 'Write…',
  editable: true
})

const emit = defineEmits<{
  'update:modelValue': [value: any]
}>()

const value = computed({
  get: () => props.modelValue,
  set: (nextValue) => emit('update:modelValue', nextValue)
})

const customHandlers = {
  imageUpload: {
    canExecute: (editor: Editor) => editor.can().insertContent({ type: 'imageUpload' }),
    execute: (editor: Editor) => editor.chain().focus().insertContent({ type: 'imageUpload' }),
    isActive: (editor: Editor) => editor.isActive('imageUpload'),
    isDisabled: undefined
  }
} satisfies EditorCustomHandlers

const toolbarItems = [[{
  kind: 'undo',
  icon: 'i-lucide-undo',
  tooltip: { text: 'Undo' }
}, {
  kind: 'redo',
  icon: 'i-lucide-redo',
  tooltip: { text: 'Redo' }
}], [{
  icon: 'i-lucide-heading',
  tooltip: { text: 'Headings' },
  content: { align: 'start' },
  items: [{
    kind: 'heading',
    level: 1,
    icon: 'i-lucide-heading-1',
    label: 'Heading 1'
  }, {
    kind: 'heading',
    level: 2,
    icon: 'i-lucide-heading-2',
    label: 'Heading 2'
  }, {
    kind: 'heading',
    level: 3,
    icon: 'i-lucide-heading-3',
    label: 'Heading 3'
  }, {
    kind: 'heading',
    level: 4,
    icon: 'i-lucide-heading-4',
    label: 'Heading 4'
  }]
}, {
  icon: 'i-lucide-list',
  tooltip: { text: 'Lists' },
  content: { align: 'start' },
  items: [{
    kind: 'bulletList',
    icon: 'i-lucide-list',
    label: 'Bullet List'
  }, {
    kind: 'orderedList',
    icon: 'i-lucide-list-ordered',
    label: 'Ordered List'
  }]
}, {
  kind: 'blockquote',
  icon: 'i-lucide-text-quote',
  tooltip: { text: 'Blockquote' }
}, {
  kind: 'codeBlock',
  icon: 'i-lucide-square-code',
  tooltip: { text: 'Code Block' }
}, {
  kind: 'horizontalRule',
  icon: 'i-lucide-separator-horizontal',
  tooltip: { text: 'Horizontal Rule' }
}], [{
  kind: 'mark',
  mark: 'bold',
  icon: 'i-lucide-bold',
  tooltip: { text: 'Bold' }
}, {
  kind: 'mark',
  mark: 'italic',
  icon: 'i-lucide-italic',
  tooltip: { text: 'Italic' }
}, {
  kind: 'mark',
  mark: 'underline',
  icon: 'i-lucide-underline',
  tooltip: { text: 'Underline' }
}, {
  kind: 'mark',
  mark: 'strike',
  icon: 'i-lucide-strikethrough',
  tooltip: { text: 'Strikethrough' }
}, {
  kind: 'mark',
  mark: 'code',
  icon: 'i-lucide-code',
  tooltip: { text: 'Code' }
}], [{
  slot: 'link' as const,
  icon: 'i-lucide-link'
}, {
  kind: 'imageUpload',
  icon: 'i-lucide-image',
  tooltip: { text: 'Image' }
}], [{
  icon: 'i-lucide-align-justify',
  tooltip: { text: 'Text Align' },
  content: { align: 'end' },
  items: [{
    kind: 'textAlign',
    align: 'left',
    icon: 'i-lucide-align-left',
    label: 'Align Left'
  }, {
    kind: 'textAlign',
    align: 'center',
    icon: 'i-lucide-align-center',
    label: 'Align Center'
  }, {
    kind: 'textAlign',
    align: 'right',
    icon: 'i-lucide-align-right',
    label: 'Align Right'
  }, {
    kind: 'textAlign',
    align: 'justify',
    icon: 'i-lucide-align-justify',
    label: 'Align Justify'
  }]
}]] satisfies EditorToolbarItem<typeof customHandlers>[][]

const suggestionItems = [[{
  type: 'label',
  label: 'Style'
}, {
  kind: 'paragraph',
  label: 'Paragraph',
  icon: 'i-lucide-type'
}, {
  kind: 'heading',
  level: 1,
  label: 'Heading 1',
  icon: 'i-lucide-heading-1'
}, {
  kind: 'heading',
  level: 2,
  label: 'Heading 2',
  icon: 'i-lucide-heading-2'
}, {
  kind: 'heading',
  level: 3,
  label: 'Heading 3',
  icon: 'i-lucide-heading-3'
}, {
  kind: 'bulletList',
  label: 'Bullet List',
  icon: 'i-lucide-list'
}, {
  kind: 'orderedList',
  label: 'Numbered List',
  icon: 'i-lucide-list-ordered'
}, {
  kind: 'blockquote',
  label: 'Blockquote',
  icon: 'i-lucide-text-quote'
}, {
  kind: 'codeBlock',
  label: 'Code Block',
  icon: 'i-lucide-square-code'
}], [{
  type: 'label',
  label: 'Insert'
}, {
  kind: 'imageUpload',
  label: 'Image',
  icon: 'i-lucide-image'
}, {
  kind: 'horizontalRule',
  label: 'Horizontal Rule',
  icon: 'i-lucide-separator-horizontal'
}]] satisfies EditorSuggestionMenuItem<typeof customHandlers>[][]

const selectedNode = ref<{ node: JSONContent | null, pos: number }>()

const getDragHandleItems = (editor: Editor): DropdownMenuItem[][] => {
  if (!selectedNode.value?.node?.type) {
    return []
  }

  const nodeType = selectedNode.value.node.type
  const label = nodeType ? nodeType[0].toUpperCase() + nodeType.slice(1) : 'Block'

  return mapEditorItems(editor, [[
    {
      type: 'label',
      label
    },
    {
      label: 'Turn into',
      icon: 'i-lucide-repeat-2',
      children: [
        { kind: 'paragraph', label: 'Paragraph', icon: 'i-lucide-type' },
        { kind: 'heading', level: 1, label: 'Heading 1', icon: 'i-lucide-heading-1' },
        { kind: 'heading', level: 2, label: 'Heading 2', icon: 'i-lucide-heading-2' },
        { kind: 'heading', level: 3, label: 'Heading 3', icon: 'i-lucide-heading-3' },
        { kind: 'heading', level: 4, label: 'Heading 4', icon: 'i-lucide-heading-4' },
        { kind: 'bulletList', label: 'Bullet List', icon: 'i-lucide-list' },
        { kind: 'orderedList', label: 'Ordered List', icon: 'i-lucide-list-ordered' },
        { kind: 'blockquote', label: 'Blockquote', icon: 'i-lucide-text-quote' },
        { kind: 'codeBlock', label: 'Code Block', icon: 'i-lucide-square-code' }
      ]
    },
    {
      kind: 'clearFormatting',
      pos: selectedNode.value?.pos,
      label: 'Reset formatting',
      icon: 'i-lucide-rotate-ccw'
    }
  ], [
    {
      kind: 'duplicate',
      pos: selectedNode.value?.pos,
      label: 'Duplicate',
      icon: 'i-lucide-copy'
    },
    {
      label: 'Copy to clipboard',
      icon: 'i-lucide-clipboard',
      onSelect: async () => {
        if (!selectedNode.value) return

        const pos = selectedNode.value.pos
        const node = editor.state.doc.nodeAt(pos)
        if (node) {
          await navigator.clipboard.writeText(node.textContent)
        }
      }
    }
  ], [
    {
      kind: 'moveUp',
      pos: selectedNode.value?.pos,
      label: 'Move up',
      icon: 'i-lucide-arrow-up'
    },
    {
      kind: 'moveDown',
      pos: selectedNode.value?.pos,
      label: 'Move down',
      icon: 'i-lucide-arrow-down'
    }
  ], [
    {
      kind: 'delete',
      pos: selectedNode.value?.pos,
      label: 'Delete',
      icon: 'i-lucide-trash'
    }
  ]], customHandlers) as DropdownMenuItem[][]
}

const onNodeChange = (event: { node: JSONContent | null, pos: number }) => {
  selectedNode.value = event
}

const getImageToolbarItems = (editor: Editor): EditorToolbarItem<typeof customHandlers>[][] => {
  const node = editor.state.doc.nodeAt(editor.state.selection.from)

  return [[{
    icon: 'i-lucide-download',
    to: node?.attrs?.src,
    download: true,
    tooltip: { text: 'Download' }
  }, {
    icon: 'i-lucide-refresh-cw',
    tooltip: { text: 'Replace' },
    onClick: () => {
      const { state } = editor
      const { selection } = state
      const pos = selection.from
      const current = state.doc.nodeAt(pos)

      if (!current || current.type.name !== 'image') return

      editor
        .chain()
        .focus()
        .deleteRange({ from: pos, to: pos + current.nodeSize })
        .insertContentAt(pos, { type: 'imageUpload' })
        .run()
    }
  }], [{
    icon: 'i-lucide-trash',
    tooltip: { text: 'Delete' },
    onClick: () => {
      const { state } = editor
      const { selection } = state

      const pos = selection.from
      const current = state.doc.nodeAt(pos)

      if (current && current.type.name === 'image') {
        editor.chain().focus().deleteRange({ from: pos, to: pos + current.nodeSize }).run()
      }
    }
  }]]
}

const extensions = markRaw([
  markRaw(TextAlign.configure({ types: ['heading', 'paragraph'] })),
  markRaw(ImageUpload)
])
</script>

<template>
  <ClientOnly>
    <UEditor
      v-slot="{ editor, handlers }"
      v-model="value"
      content-type="json"
      :extensions="extensions"
      :handlers="customHandlers"
      :editable="editable"
      :placeholder="placeholder"
      class="w-full min-h-48 rounded-md border border-muted bg-default"
      :style="{ borderRadius: 'var(--ui-radius)' }"
      :ui="{ base: 'px-4 py-3' }"
      v-bind="$attrs"
    >
      <UEditorToolbar
        v-if="editable"
        :editor="editor"
        :items="toolbarItems"
        class="border-b border-muted bg-default px-2 py-2 flex-wrap"
        :style="{
          borderTopLeftRadius: 'var(--ui-radius)',
          borderTopRightRadius: 'var(--ui-radius)'
        }"
      >
        <template #link>
          <RichEditorLinkPopover :editor="editor" auto-open />
        </template>
      </UEditorToolbar>

      <UEditorToolbar
        v-if="editable"
        :editor="editor"
        :items="getImageToolbarItems(editor)"
        layout="bubble"
        plugin-key="richtext-image-bubble"
        :should-show="({ editor, view }: any) => {
          return editor.isActive('image') && view.hasFocus()
        }"
      />

      <UEditorDragHandle
        v-if="editable"
        v-slot="{ ui, onClick }"
        :editor="editor"
        plugin-key="richtext-drag-handle"
        @node-change="onNodeChange"
      >
        <UButton
          icon="i-lucide-plus"
          color="neutral"
          variant="ghost"
          size="sm"
          :class="ui.handle()"
          @click="(event: MouseEvent) => {
            event.stopPropagation()
            const node = onClick()
            handlers.suggestion?.execute(editor, { pos: node?.pos }).run()
          }"
        />

        <UDropdownMenu
          v-slot="{ open }"
          :modal="false"
          :items="getDragHandleItems(editor)"
          :content="{ side: 'left' }"
          :ui="{ content: 'w-48', label: 'text-xs' }"
          @update:open="editor.chain().setMeta('lockDragHandle', $event).run()"
        >
          <UButton
            color="neutral"
            variant="ghost"
            active-variant="soft"
            size="sm"
            icon="i-lucide-grip-vertical"
            :active="open"
            :class="ui.handle()"
          />
        </UDropdownMenu>
      </UEditorDragHandle>

      <UEditorSuggestionMenu
        v-if="editable"
        :editor="editor"
        :items="suggestionItems"
        plugin-key="richtext-suggestion-menu"
      />
    </UEditor>
    <template #fallback>
      <USkeleton class="h-48 w-full" />
    </template>
  </ClientOnly>
</template>
