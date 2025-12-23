<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({
  layout: 'desk'
})

const route = useRoute()
const schemaKey = computed(() => String(route.params.schemaKey))
const status = ref<string>('all')

const { data: schema } = await useFetch<any>(() => `/api/schema/${schemaKey.value}/active`)
const { data: list } = await useFetch<{ items: Array<{ id: string; title?: string; status: string; updatedAt: string; assetId?: string | null }> }>(() => `/api/content/${schemaKey.value}`, {
  query: computed(() => ({
    limit: 50,
    status: status.value === 'all' ? undefined : status.value
  }))
})

type ContentRow = { id: string; title?: string; status: string; updatedAt: string; assetId?: string | null }

const UBadge = resolveComponent('UBadge')
const UAvatar = resolveComponent('UAvatar')
const NuxtLink = resolveComponent('NuxtLink')

const columns = computed<TableColumn<ContentRow>[]>(() => ([
  {
    accessorKey: 'title',
    header: 'Title',
    cell: ({ row }) => {
      const title = row.original.title || row.original.id
      const assetId = row.original.assetId
      return h('div', { class: 'flex items-center gap-3 min-w-0' }, [
        assetId
          ? h(UAvatar, {
            size: 'lg',
            src: `/assets/${assetId}/raw`,
            icon: 'i-lucide-image',
            loading: 'lazy',
            class: 'shrink-0'
          })
          : null,
        h(NuxtLink, {
          to: `/_desk/content/${schemaKey.value}/${row.original.id}`,
          class: 'text-highlighted hover:underline font-medium truncate'
        }, () => title)
      ])
    }
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const current = row.getValue('status') as string
      const color = ({
        published: 'success',
        draft: 'warning',
        archived: 'neutral',
        deleted: 'error'
      } as const)[current] ?? 'neutral'

      return h(UBadge, { class: 'capitalize', variant: 'subtle', color }, () => current)
    }
  },
  {
    accessorKey: 'updatedAt',
    header: 'Updated',
    cell: ({ row }) => new Date(row.getValue('updatedAt') as string).toLocaleString()
  }
]))
</script>

<template>
  <UDashboardPanel id="desk-content-list">
    <template #header>
      <DeskNavbar
        :title="schema?.title || schemaKey"
        description="Content entries"
      >
        <template #actions>
          <UButton
            :to="`/_desk/content/${schemaKey}/new`"
            icon="i-lucide-plus"
            aria-label="New"
          >
            <span class="hidden sm:inline">New {{ schema?.title || schemaKey }}</span>
          </UButton>
        </template>
      </DeskNavbar>
    </template>

    <template #body>
      <div class="flex items-center gap-2">
        <USelect
          v-model="status"
          :items="[
            { label: 'all', value: 'all' },
            { label: 'draft', value: 'draft' },
            { label: 'published', value: 'published' },
            { label: 'archived', value: 'archived' },
            { label: 'deleted', value: 'deleted' }
          ]"
          class="w-40 sm:w-56"
        />
      </div>

      <UTable
        :data="list?.items || []"
        :columns="columns"
        class="w-full"
      />
    </template>
  </UDashboardPanel>
</template>
