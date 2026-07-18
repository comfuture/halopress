import type {
  SiteMenuAdminResource,
  SiteMenuListResponse,
  SiteMenuUpdate
} from '~~/shared/site-menu'

const SITE_MENUS_DATA_KEY = 'site-menu-sets'

function useSiteMenusData() {
  return useFetch<SiteMenuListResponse>('/api/site/menus', {
    key: SITE_MENUS_DATA_KEY,
    dedupe: 'defer'
  })
}

export function useSiteMenusStatus() {
  const { data, pending, status, error, refresh, execute, clear } = useSiteMenusData()
  return { data, pending, status, error, refresh, execute, clear }
}

export async function useSiteMenus() {
  const saving = ref(false)
  const creating = ref(false)
  const deleting = ref(false)
  // Mutable editors wait for the persisted menu documents so local defaults
  // cannot overwrite an existing order while hydration is still pending.
  const result = await useSiteMenusData()

  function replaceResource(resource: SiteMenuAdminResource) {
    if (!result.data.value) return
    const index = result.data.value.items.findIndex(item => item.id === resource.id)
    if (index === -1) result.data.value.items.push(resource)
    else result.data.value.items[index] = resource
  }

  async function createMenu(name: string) {
    creating.value = true
    try {
      const resource = await $fetch<SiteMenuAdminResource>('/api/site/menus', {
        method: 'POST',
        body: { name }
      })
      replaceResource(resource)
      return resource
    } finally {
      creating.value = false
    }
  }

  async function saveMenu(menuId: string, update: SiteMenuUpdate) {
    saving.value = true
    try {
      const resource = await $fetch<SiteMenuAdminResource>(`/api/site/menus/${encodeURIComponent(menuId)}`, {
        method: 'PUT',
        body: update
      })
      replaceResource(resource)
      await refreshNuxtData('site-presentation')
      return resource
    } finally {
      saving.value = false
    }
  }

  async function deleteMenu(menuId: string) {
    deleting.value = true
    try {
      await $fetch(`/api/site/menus/${encodeURIComponent(menuId)}`, { method: 'DELETE' })
      if (result.data.value) {
        result.data.value.items = result.data.value.items.filter(item => item.id !== menuId)
      }
    } catch (error) {
      const usage = siteMenuUsageFromFetchError(error)
      const resource = result.data.value?.items.find(item => item.id === menuId)
      if (usage && resource) {
        resource.usage = usage
        resource.canDelete = false
      }
      throw error
    } finally {
      deleting.value = false
    }
  }

  return { ...result, saving, creating, deleting, createMenu, saveMenu, deleteMenu }
}
