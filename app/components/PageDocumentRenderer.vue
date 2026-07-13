<script setup lang="ts">
import { buildPageDocumentSegments } from '~/editor/page/render-document'
import PageBlockView from '~/editor/page/PageBlockView.vue'

const props = defineProps<{
  document: unknown
}>()

const segments = computed(() => buildPageDocumentSegments(props.document))
</script>

<template>
  <div class="page-document space-y-6" data-page-document-renderer>
    <template v-for="segment in segments" :key="segment.key">
      <div
        v-if="segment.kind === 'html'"
        class="page-document-richtext"
        data-page-document-richtext
        v-html="segment.html"
      />
      <PageBlockView
        v-else-if="segment.kind === 'block'"
        :attrs="segment.attrs"
      />
      <div
        v-else
        class="rounded-lg border border-dashed border-muted p-6 text-sm text-muted"
        data-page-document-fallback
      >
        {{ segment.message }}
      </div>
    </template>
  </div>
</template>
