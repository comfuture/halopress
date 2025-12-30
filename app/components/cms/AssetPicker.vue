<script setup lang="ts">
import type { CommandPaletteGroup, CommandPaletteItem } from '@nuxt/ui'

const props = defineProps<{
  modelValue: string | null | undefined
  label?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: string | null): void
}>()

const file = ref<File | null>(null)
const uploading = ref(false)
const paletteOpen = ref(false)
const toast = useToast()

const previewUrl = computed(() => props.modelValue ? `/assets/${props.modelValue}/raw` : null)

const { data: assetList, refresh: refreshAssets } = useFetch<{ items: Array<{ id: string; kind: string; sizeBytes: number; createdAt: string }> }>('/api/assets/list', {
  query: { limit: 100 },
  lazy: true
})

function formatBytes(bytes?: number) {
  if (!Number.isFinite(bytes)) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = Math.max(0, bytes || 0)
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  const text = value >= 10 || i === 0 ? value.toFixed(0) : value.toFixed(1)
  return `${text} ${units[i]}`
}

const assetGroups = computed<CommandPaletteGroup<CommandPaletteItem>[]>(() => {
  const items = (assetList.value?.items || []).map(asset => ({
    label: asset.id,
    value: asset.id,
    suffix: [asset.kind, formatBytes(asset.sizeBytes)].filter(Boolean).join(' | '),
    imageUrl: asset.kind === 'image' ? `/assets/${asset.id}/raw` : undefined,
    active: props.modelValue === asset.id,
    onSelect: () => {
      emit('update:modelValue', asset.id)
      paletteOpen.value = false
    }
  }))

  return [
    {
      id: 'assets',
      label: items.length ? undefined : 'No assets found',
      items
    }
  ]
})

watch(paletteOpen, (open) => {
  if (open) refreshAssets()
})

watch(file, async (f) => {
  if (!f) return
  uploading.value = true
  try {
    const form = new FormData()
    form.append('file', f, f.name)
    const res = await $fetch<{ assetId: string }>('/api/assets/upload', {
      method: 'POST',
      body: form
    })
    emit('update:modelValue', res.assetId)
    toast.add({ title: 'Uploaded', description: res.assetId })
    await refreshAssets()
  } catch (err: any) {
    toast.add({ title: 'Upload failed', description: err?.statusMessage || 'Error', color: 'error' })
  } finally {
    uploading.value = false
    file.value = null
  }
})

function clear() {
  emit('update:modelValue', null)
}
</script>

<template>
  <div class="space-y-2">
    <div class="flex items-center justify-between">
      <span class="text-sm font-medium">{{ label || 'Asset' }}</span>
      <UButton
        v-if="modelValue"
        size="xs"
        color="neutral"
        variant="outline"
        icon="i-lucide-x"
        @click="clear"
      >
        Clear
      </UButton>
    </div>

    <div v-if="previewUrl" class="rounded-md border border-muted overflow-hidden">
      <NuxtImg
        :src="previewUrl"
        alt=""
        preset="content"
        class="w-full max-h-64 object-cover"
      />
    </div>

    <UFileUpload
      v-model="file"
      accept="image/*"
      :disabled="uploading"
      :interactive="!uploading"
      label="Upload image"
      description="Drag & drop or click to select."
      class="w-full min-h-28"
    />

    <div class="flex items-center justify-between">
      <span class="text-xs text-muted">Or link an existing asset</span>
      <UModal
        v-model:open="paletteOpen"
        title="Select existing asset"
        :ui="{
          content: 'bg-default flex flex-col focus:outline-none w-[min(720px,96vw)]',
          header: 'hidden',
          body: 'p-0 sm:p-0',
          footer: 'p-3 sm:p-3 justify-end'
        }"
      >
        <UButton color="neutral" variant="outline" size="xs" icon="i-lucide-image">
          Select existing
        </UButton>
        <template #body>
          <UCommandPalette
            :groups="assetGroups"
            placeholder="Search assets..."
            class="h-[70vh] max-h-[520px] w-full"
            :ui="{
              input: '[&>input]:h-12 [&>input]:text-base',
              viewport: 'p-2 grid grid-cols-2 gap-2',
              group: 'contents',
              label: 'col-span-full px-1 text-xs text-muted',
              item: 'p-0 w-full',
              itemWrapper: 'w-full'
            }"
          >
            <template #item="{ item }">
              <div
                class="w-full overflow-hidden rounded-md border border-default bg-default/60 hover:bg-elevated/40 transition"
                :class="item.active ? 'ring-2 ring-primary/50' : ''"
              >
                <div class="w-full aspect-[4/3] max-h-24 overflow-hidden rounded-sm bg-elevated/50 flex items-center justify-center">
                  <NuxtImg
                    v-if="item.imageUrl"
                    :src="item.imageUrl"
                    alt=""
                    preset="card"
                    class="h-full w-full object-cover"
                  />
                  <UIcon v-else name="i-lucide-file" size="24" class="text-muted" />
                </div>
                <div class="p-2 text-xs">
                  <div class="font-medium truncate">{{ item.label }}</div>
                  <div class="text-muted truncate">{{ item.suffix }}</div>
                </div>
              </div>
            </template>
          </UCommandPalette>
        </template>
        <template #footer>
          <UButton color="neutral" variant="outline" @click="paletteOpen = false">
            Close
          </UButton>
        </template>
      </UModal>
    </div>

    <p v-if="uploading" class="text-xs text-muted">
      Uploading…
    </p>
    <p v-else-if="modelValue" class="text-xs text-muted break-all">
      {{ modelValue }}
    </p>
  </div>
</template>
