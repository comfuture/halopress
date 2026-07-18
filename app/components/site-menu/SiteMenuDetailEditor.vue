<script setup lang="ts">
import type { SiteMenuLeaf, SiteMenuValidationIssue } from '~~/shared/site-menu'

const model = defineModel<SiteMenuLeaf>({ required: true })
defineProps<{
  pathPrefix: string
  isParent: boolean
  hasChildren?: boolean
  validationIssues?: SiteMenuValidationIssue[]
}>()
</script>

<template>
  <div class="space-y-4" data-menu-detail-editor>
    <div class="space-y-1">
      <div class="flex flex-wrap items-center gap-2">
        <h3 class="text-base font-semibold text-highlighted" data-menu-detail-heading tabindex="-1">
          Edit {{ model.label || 'menu item' }}
        </h3>
        <UBadge color="neutral" variant="soft">
          {{ isParent ? 'Top-level link' : 'Child link' }}
        </UBadge>
      </div>
      <p class="text-xs text-muted">Stable item ID: {{ model.id }}</p>
    </div>

    <UAlert
      v-if="isParent && hasChildren"
      title="This link opens a submenu"
      description="Its destination remains saved and becomes active again if all child links are removed."
      color="info"
      variant="subtle"
      icon="i-lucide-list-tree"
    />

    <SiteMenuItemEditor
      v-model="model"
      :path-prefix="pathPrefix"
      :validation-issues="validationIssues"
    />
  </div>
</template>
