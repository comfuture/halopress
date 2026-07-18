import {
  normalizePublicSiteThemeManifest,
  type PublicSiteThemeManifest
} from '~~/shared/site-theme'

const SITE_THEME_MANIFEST_DATA_KEY = 'site-theme-manifest'

export function useSiteTheme() {
  const {
    data,
    pending,
    status,
    error,
    refresh,
    execute,
    clear
  } = useFetch<PublicSiteThemeManifest>('/api/delivery/site-theme', {
    key: SITE_THEME_MANIFEST_DATA_KEY,
    dedupe: 'defer'
  })
  const theme = computed(() => normalizePublicSiteThemeManifest(data.value))
  return { data, theme, pending, status, error, refresh, execute, clear }
}
