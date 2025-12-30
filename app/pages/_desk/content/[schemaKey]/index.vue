<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({
  layout: 'desk'
})

const route = useRoute()
const schemaKey = computed(() => String(route.params.schemaKey))
const status = ref<string>('all')
const statusFilter = computed(() => (status.value === 'all' ? null : status.value))

const { data: schema } = await useFetch<any>(() => `/api/schema/${schemaKey.value}/active`)
const { items } = await useHalopressQuery(schemaKey, {
  pageSize: 50,
  status: statusFilter
})

type ContentRow = { id: string; title: string | null; description: string | null; image: string | null; status: string; updatedAt: string }

const UBadge = resolveComponent('UBadge')
const UAvatar = resolveComponent('UAvatar')
const NuxtLink = resolveComponent('NuxtLink')

const columns = computed<TableColumn<ContentRow>[]>(() => ([
  {
    accessorKey: 'title',
    header: 'Title',
    cell: ({ row }) => {
      const title = row.original.title || row.original.id
      return h('div', { class: 'flex items-center gap-3 min-w-0' }, [
        row.original.image
          ? h(UAvatar, {
            size: 'lg',
            src: row.original.image,
            icon: 'i-lucide-image',
            loading: 'lazy',
            class: 'shrink-0'
          })
          : null,
        h('div', { class: 'min-w-0' }, [
          h(NuxtLink, {
            to: `/_desk/content/${schemaKey.value}/${row.original.id}`,
            class: 'text-highlighted hover:underline font-medium truncate'
          }, () => title),
          row.original.description
            ? h('p', { class: 'text-sm text-muted truncate' }, row.original.description)
            : null
        ])
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
        :data="items || []"
        :columns="columns"
        class="w-full"
      />
    </template>
  </UDashboardPanel>
</template>
