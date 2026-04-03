<script setup lang="ts">
import type { NodeViewProps } from '@tiptap/vue-3'
import { NodeViewWrapper } from '@tiptap/vue-3'
import { computed } from 'vue'

import { getPageBlockComponent } from './registry'

const props = defineProps<NodeViewProps>()

const componentEntry = computed(() => {
  return getPageBlockComponent(props.node.attrs.component)
})

const mergedProps = computed(() => {
  const base = componentEntry.value?.defaultProps ?? {}
  const override = props.node.attrs.props ?? {}
  const advanced = props.node.attrs.advanced ?? {}
  return { ...base, ...override, ...advanced }
})

const media = computed(() => {
  return props.node.attrs.media ?? {}
})
</script>

<template>
  <NodeViewWrapper :class="['page-block-node', props.selected && 'ring-2 ring-primary/30 rounded-xl']">
    <component
      v-if="componentEntry"
      :is="componentEntry.componentName"
      v-bind="mergedProps"
      class="w-full"
    >
      <img
        v-if="media.url"
        :src="media.url"
        :alt="media.alt || ''"
        :width="media.width"
        :height="media.height"
        :class="media.class || 'w-full rounded-lg'"
      >
    </component>

    <div v-else class="rounded-lg border border-dashed border-muted p-6 text-sm text-muted">
      Unknown component
    </div>
  </NodeViewWrapper>
</template>
