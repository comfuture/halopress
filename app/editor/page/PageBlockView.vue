<script setup lang="ts">
import { resolvePageBlock, type StoredPageBlockAttrs } from '~~/shared/page-blocks'

const props = defineProps<{
  attrs: StoredPageBlockAttrs
}>()

const resolved = computed(() => resolvePageBlock(props.attrs))
</script>

<template>
  <component
    :is="resolved.componentName"
    v-if="resolved.status === 'known'"
    v-bind="resolved.props"
    class="w-full"
    data-page-block-view
  >
    <img
      v-if="resolved.media.url"
      :src="resolved.media.url"
      :alt="resolved.media.alt || ''"
      :width="resolved.media.width"
      :height="resolved.media.height"
      class="w-full rounded-lg"
    >
  </component>

  <div
    v-else
    class="rounded-lg border border-dashed border-muted p-6 text-sm text-muted"
    data-page-block-fallback
    :data-page-block-status="resolved.status"
  >
    {{ resolved.reason }}<span v-if="resolved.key">: {{ resolved.key }}</span>
  </div>
</template>
