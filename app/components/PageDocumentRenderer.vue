<script setup lang="ts">
import { normalizeAuthoredDocument } from '~~/shared/authored-document'
import PageBlockView from '~/editor/page/PageBlockView.vue'

const props = withDefaults(defineProps<{
  document: unknown
  isolated?: boolean
}>(), {
  isolated: false
})

const normalized = computed(() => normalizeAuthoredDocument(props.document, {
  allowPageBlocks: true,
  allowPageHero: true
}))
</script>

<template>
  <div
    class="site-document site-page-document"
    data-page-document-renderer
    data-site-document-renderer
    :data-site-document-isolated="isolated ? 'true' : undefined"
  >
    <template v-for="(node, index) in normalized.content" :key="index">
      <div
        v-if="node.type === 'pageBlock'"
        :id="node.anchorId"
        class="site-page-block-anchor"
        data-site-page-block-anchor
      >
        <PageBlockView :attrs="node.attrs" />
      </div>
      <SiteDocumentNode v-else :node="node" />
    </template>
  </div>
</template>
