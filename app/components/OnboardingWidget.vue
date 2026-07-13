<script setup lang="ts">
import {
  EXPECTED_ONBOARDING_ITEM_COUNT,
  getOnboardingItems,
  hasCompletedOnboarding,
  type OnboardingStatus
} from '../utils/onboarding'

const dismissed = useCookie<boolean>('halopress_onboarding_dismissed_v1', {
  default: () => false,
  path: '/_desk',
  sameSite: 'lax'
})

const { data, pending, error, refresh } = await useLazyFetch<OnboardingStatus>('/api/settings/onboarding', {
  immediate: !dismissed.value,
  server: false
})

const items = computed(() => data.value ? getOnboardingItems(data.value) : [])
const completedCount = computed(() => items.value.filter(item => item.complete).length)
const isComplete = computed(() => hasCompletedOnboarding(items.value))
const isVisible = computed(() => !dismissed.value && !isComplete.value)
let lastRefreshAt = 0

function dismiss() {
  dismissed.value = true
}

function refreshWhenVisible() {
  if (document.visibilityState !== 'visible' || dismissed.value) return

  const now = Date.now()
  if (now - lastRefreshAt < 30_000) return

  lastRefreshAt = now
  void refresh()
}

onMounted(() => {
  lastRefreshAt = Date.now()
  document.addEventListener('visibilitychange', refreshWhenVisible)
  window.addEventListener('focus', refreshWhenVisible)
})

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', refreshWhenVisible)
  window.removeEventListener('focus', refreshWhenVisible)
})
</script>

<template>
  <UCard
    v-if="isVisible"
    variant="subtle"
    aria-labelledby="onboarding-widget-title"
    :ui="{
      header: 'p-4 sm:px-5',
      body: 'p-2 sm:p-3'
    }"
  >
    <template #header>
      <div class="space-y-3">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h2 id="onboarding-widget-title" class="font-semibold text-highlighted">
              Finish setting up HaloPress
            </h2>
            <p class="mt-0.5 text-xs text-muted">
              <template v-if="data">
                {{ completedCount }} of {{ EXPECTED_ONBOARDING_ITEM_COUNT }} complete
              </template>
              <template v-else-if="error">
                Setup progress is unavailable
              </template>
              <template v-else>
                Checking setup progress…
              </template>
            </p>
          </div>

          <div v-if="data" class="flex shrink-0 items-center gap-1">
            <UButton
              icon="i-lucide-rotate-cw"
              aria-label="Refresh onboarding status"
              color="neutral"
              variant="ghost"
              size="xs"
              square
              :loading="pending"
              @click="refresh()"
            />
            <UButton
              label="Dismiss for now"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="dismiss"
            />
          </div>
        </div>

        <UProgress
          v-if="data"
          :model-value="completedCount"
          :max="EXPECTED_ONBOARDING_ITEM_COUNT"
          size="xs"
          aria-label="Onboarding progress"
        />
      </div>
    </template>

    <ul v-if="data" class="space-y-1" aria-label="Recommended setup checklist">
      <li v-for="item in items" :key="item.key">
        <ULink
          :to="item.to"
          :external="item.external"
          :target="item.external ? '_blank' : undefined"
          raw
          class="group flex min-h-10 items-center gap-3 rounded-md px-2.5 py-2 outline-primary/25 transition-colors hover:bg-elevated focus-visible:outline-3"
        >
          <UIcon
            :name="item.complete ? 'i-lucide-circle-check-big' : 'i-lucide-circle'"
            :class="item.complete ? 'text-success' : 'text-dimmed group-hover:text-primary'"
            class="size-5 shrink-0 transition-colors"
            aria-hidden="true"
          />
          <span
            class="min-w-0 truncate text-sm"
            :class="item.complete ? 'text-muted' : 'font-medium text-highlighted'"
          >
            {{ item.title }}
          </span>
          <span class="sr-only">
            — {{ item.complete ? 'Complete' : 'Not complete' }}<template v-if="item.external">, opens in a new tab</template>
          </span>
        </ULink>
      </li>
    </ul>

    <div v-else-if="error" class="flex items-center justify-between gap-3 px-2.5 py-2 text-sm text-muted">
      <span>Could not load the checklist.</span>
      <UButton
        label="Retry"
        color="neutral"
        variant="outline"
        size="xs"
        icon="i-lucide-rotate-cw"
        :loading="pending"
        @click="refresh()"
      />
    </div>

    <div v-else class="flex min-h-32 items-center justify-center" aria-live="polite">
      <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin text-muted" />
      <span class="sr-only">Loading onboarding status</span>
    </div>
  </UCard>
</template>
