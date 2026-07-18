<script setup lang="ts">
const previewDocument = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 1 },
      content: [{ type: 'text', text: 'A portable HaloPress page' }]
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Body typography, semantic colors, spacing, and radii come from the published Theme artifact.' }
      ]
    },
    {
      type: 'blockquote',
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: 'The same artifact renders in Desk, the built-in Site, and headless consumers.' }]
      }]
    }
  ]
}
</script>

<template>
  <PageDocumentRenderer
    :document="previewDocument"
    isolated
    class="h-[34rem] min-h-[34rem] overflow-hidden rounded-lg border border-muted bg-default"
    data-site-theme-artifact-preview
  />
</template>
