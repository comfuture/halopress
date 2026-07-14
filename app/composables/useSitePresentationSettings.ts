import type {
  SitePresentation,
  SitePresentationPatch
} from '~~/shared/site-presentation'

export type SitePresentationAdminResponse = {
  value: SitePresentation
  configured: boolean
  malformedStoredValue: boolean
  updatedAt: string | null
  updatedBy: string | null
  management: {
    source: 'default' | 'desk'
    editable: true
    secret: false
  }
  missingAssetIds: string[]
}

export async function useSitePresentationSettings() {
  const saving = ref(false)
  const result = await useFetch<SitePresentationAdminResponse>('/api/settings/site-presentation')

  async function savePatch(patch: SitePresentationPatch) {
    saving.value = true
    try {
      const response = await $fetch<SitePresentationAdminResponse>('/api/settings/site-presentation', {
        method: 'PUT',
        body: patch
      })
      result.data.value = response
      await refreshNuxtData('site-presentation')
      return response
    } finally {
      saving.value = false
    }
  }

  return { ...result, saving, savePatch }
}
