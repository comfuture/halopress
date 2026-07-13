<script setup lang="ts">
definePageMeta({
  layout: 'desk'
})

type OnboardingStatus = {
  schemas: {
    complete: boolean
    count: number
    firstSchemaKey: string | null
  }
  content: {
    complete: boolean
    count: number
  }
  customDomain: {
    complete: boolean
    hostname: string
  }
  imageTransformations: {
    complete: boolean
  }
  googleOAuth: {
    complete: boolean
    configured: boolean
    enabled: boolean
  }
}

type OnboardingItem = {
  key: string
  title: string
  description: string
  detail: string
  complete: boolean
  to: string
  external?: boolean
  action: string
  incompleteLabel?: string
}

const { data, pending, error, refresh } = await useFetch<OnboardingStatus>('/api/settings/onboarding')

const items = computed<OnboardingItem[]>(() => {
  const status = data.value
  if (!status) return []

  const contentLink = status.schemas.firstSchemaKey
    ? `/_desk/content/${encodeURIComponent(status.schemas.firstSchemaKey)}/new`
    : '/_desk/schemas/new'

  return [
    {
      key: 'schema',
      title: 'Create a schema',
      description: 'Define a content structure and publish its first immutable version.',
      detail: status.schemas.complete
        ? `${status.schemas.count} active schema${status.schemas.count === 1 ? '' : 's'}`
        : 'No user-created schemas yet.',
      complete: status.schemas.complete,
      to: '/_desk/schemas/new',
      action: 'Create schema'
    },
    {
      key: 'content',
      title: 'Publish new content',
      description: 'Create an entry from an active schema and make it available to readers.',
      detail: status.content.complete
        ? `${status.content.count} published entr${status.content.count === 1 ? 'y' : 'ies'}`
        : status.schemas.complete ? 'No published entries yet.' : 'Create a schema first.',
      complete: status.content.complete,
      to: contentLink,
      action: status.schemas.complete ? 'Create content' : 'Create schema first'
    },
    {
      key: 'domain',
      title: 'Set up a custom domain',
      description: 'Serve the site from a branded hostname instead of a platform subdomain.',
      detail: status.customDomain.complete
        ? `Connected as ${status.customDomain.hostname}`
        : `Not detected for this request. Current host: ${status.customDomain.hostname}`,
      complete: status.customDomain.complete,
      to: 'https://developers.cloudflare.com/workers/configuration/routing/custom-domains/',
      external: true,
      action: 'Open domain guide',
      incompleteLabel: 'Not detected'
    },
    {
      key: 'images',
      title: 'Enable Image Transformations',
      description: 'Let Cloudflare resize and optimize R2-backed thumbnails at the edge.',
      detail: status.imageTransformations.complete
        ? 'A live image transformation probe succeeded.'
        : 'Not detected. Asset previews will fall back to their original image.',
      complete: status.imageTransformations.complete,
      to: 'https://developers.cloudflare.com/images/optimization/transformations/overview/',
      external: true,
      action: 'Open image guide',
      incompleteLabel: 'Not detected'
    },
    {
      key: 'google',
      title: 'Configure Google OAuth',
      description: 'Add Google sign-in while keeping password access as an administrator recovery path.',
      detail: status.googleOAuth.complete
        ? 'Google sign-in is configured and enabled.'
        : status.googleOAuth.configured ? 'Credentials are ready; enable Google sign-in.' : 'Google credentials are not configured.',
      complete: status.googleOAuth.complete,
      to: '/_desk/settings/authentication',
      action: 'Open authentication'
    }
  ]
})

const completedCount = computed(() => items.value.filter(item => item.complete).length)
</script>

<template>
  <UDashboardPanel id="desk-settings">
    <template #header>
      <DeskNavbar title="Settings" description="Finish the recommended setup for this site.">
        <template #actions>
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-rotate-cw"
            :loading="pending"
            @click="refresh()"
          >
            Refresh
          </UButton>
        </template>
      </DeskNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-4xl space-y-6 pb-10">
        <UAlert
          v-if="error"
          title="Onboarding status is unavailable"
          :description="error.statusMessage || 'Refresh the page and try again.'"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
        />

        <UCard v-else-if="data" variant="subtle">
          <template #header>
            <div class="space-y-4">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="space-y-1">
                  <h1 class="text-base font-semibold text-highlighted">
                    Onboarding
                  </h1>
                  <p class="text-sm text-muted">
                    These steps are recommended after installation. Status is detected from this site and its current hostname.
                  </p>
                </div>
                <UBadge :color="completedCount === items.length ? 'success' : 'neutral'" variant="soft">
                  {{ completedCount }} of {{ items.length }} complete
                </UBadge>
              </div>
              <UProgress
                :model-value="completedCount"
                :max="items.length"
                :color="completedCount === items.length ? 'success' : 'primary'"
                size="sm"
              />
            </div>
          </template>

          <ul class="space-y-3" aria-label="Recommended setup checklist">
            <li
              v-for="item in items"
              :key="item.key"
              class="flex flex-col gap-4 rounded-lg border border-muted bg-default p-4 sm:flex-row sm:items-center"
            >
              <div class="flex min-w-0 flex-1 items-start gap-3">
                <UIcon
                  :name="item.complete ? 'i-lucide-circle-check-big' : 'i-lucide-circle'"
                  :class="item.complete ? 'text-success' : 'text-muted'"
                  class="mt-0.5 size-5 shrink-0"
                  aria-hidden="true"
                />
                <div class="min-w-0 space-y-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <h2 class="font-medium text-highlighted">
                      {{ item.title }}
                    </h2>
                    <UBadge :color="item.complete ? 'success' : 'neutral'" variant="soft" size="sm">
                      {{ item.complete ? 'Complete' : (item.incompleteLabel || 'Not complete') }}
                    </UBadge>
                  </div>
                  <p class="text-sm text-muted">
                    {{ item.description }}
                  </p>
                  <p class="text-xs" :class="item.complete ? 'text-success' : 'text-muted'">
                    {{ item.detail }}
                  </p>
                </div>
              </div>

              <UButton
                :to="item.to"
                :target="item.external ? '_blank' : undefined"
                color="neutral"
                variant="outline"
                :trailing-icon="item.external ? 'i-lucide-external-link' : 'i-lucide-arrow-right'"
                class="shrink-0 justify-center"
              >
                {{ item.complete ? 'Review' : item.action }}
              </UButton>
            </li>
          </ul>
        </UCard>

        <UCard v-else variant="subtle">
          <div class="flex min-h-56 items-center justify-center" aria-live="polite">
            <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-muted" />
            <span class="sr-only">Loading onboarding status</span>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
