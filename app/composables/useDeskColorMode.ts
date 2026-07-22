import {
  normalizeDeskColorModePreference,
  type DeskColorModePreference
} from '~~/shared/desk-preferences'

const DESK_COLOR_MODE_COOKIE = 'halopress_desk_color_mode'

export function useDeskColorMode() {
  const colorMode = useColorMode()
  const storedPreference = useCookie<DeskColorModePreference>(DESK_COLOR_MODE_COOKIE, {
    default: () => 'system',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365
  })
  const preference = computed<DeskColorModePreference>({
    get: () => normalizeDeskColorModePreference(storedPreference.value),
    set: (value) => {
      storedPreference.value = normalizeDeskColorModePreference(value)
    }
  })

  watch(preference, (value) => {
    colorMode.preference = value
  }, { immediate: true })

  return {
    preference,
    value: computed(() => colorMode.value)
  }
}
