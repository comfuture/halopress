import type { SiteMode } from '~~/shared/site-mode'

export type SiteModeAdminResponse = {
  value: SiteMode
  configured: boolean
  malformedStoredValue: boolean
  updatedAt: string | null
  updatedBy: string | null
  management: {
    source: 'default' | 'desk'
    editable: true
    secret: false
  }
}

const SITE_MODE_DATA_KEY = 'site-mode'

export async function useSiteMode() {
  const result = await useFetch<SiteModeAdminResponse>('/api/settings/site-mode', {
    key: SITE_MODE_DATA_KEY
  })
  const enabled = computed(() => result.data.value?.value.enabled === true)

  return { ...result, enabled }
}

export async function useSiteModeSettings() {
  const result = await useSiteMode()
  const saving = ref(false)

  async function saveEnabled(enabled: boolean) {
    saving.value = true
    try {
      const response = await $fetch<SiteModeAdminResponse>('/api/settings/site-mode', {
        method: 'PUT',
        body: { enabled }
      })
      result.data.value = response
      await refreshNuxtData(SITE_MODE_DATA_KEY)
      return response
    } finally {
      saving.value = false
    }
  }

  return { ...result, saving, saveEnabled }
}
