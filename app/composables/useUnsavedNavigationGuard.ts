import type { MaybeRefOrGetter } from 'vue'
import { onBeforeUnmount, onMounted, ref, toValue } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'

const DEFAULT_MESSAGE = 'You have unsaved changes. Leave this page and discard them?'

export function useUnsavedNavigationGuard(
  isDirty: MaybeRefOrGetter<boolean>,
  message = DEFAULT_MESSAGE
) {
  const allowNext = ref(false)

  function allowNextNavigation() {
    allowNext.value = true
  }

  onBeforeRouteLeave(() => {
    if (allowNext.value) {
      allowNext.value = false
      return true
    }
    if (!toValue(isDirty) || typeof window === 'undefined') return true
    return window.confirm(message)
  })

  function handleBeforeUnload(event: BeforeUnloadEvent) {
    if (!toValue(isDirty)) return
    event.preventDefault()
    event.returnValue = ''
  }

  onMounted(() => window.addEventListener('beforeunload', handleBeforeUnload))
  onBeforeUnmount(() => window.removeEventListener('beforeunload', handleBeforeUnload))

  return { allowNextNavigation }
}
