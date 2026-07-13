export const EXPECTED_ONBOARDING_ITEM_COUNT = 5

export type OnboardingStatus = {
  schemas: {
    complete: boolean
    firstSchemaKey: string | null
  }
  content: {
    complete: boolean
  }
  customDomain: {
    complete: boolean
  }
  imageTransformations: {
    complete: boolean
  }
  googleOAuth: {
    complete: boolean
  }
}

export type OnboardingItem = {
  key: string
  title: string
  complete: boolean
  to: string
  external?: boolean
}

export function getOnboardingItems(status: OnboardingStatus): OnboardingItem[] {
  const contentLink = status.schemas.firstSchemaKey
    ? `/_desk/content/${encodeURIComponent(status.schemas.firstSchemaKey)}/new`
    : '/_desk/schemas/new'

  return [
    {
      key: 'schema',
      title: 'Create a schema',
      complete: status.schemas.complete,
      to: '/_desk/schemas/new'
    },
    {
      key: 'content',
      title: 'Publish new content',
      complete: status.content.complete,
      to: contentLink
    },
    {
      key: 'domain',
      title: 'Set up a custom domain',
      complete: status.customDomain.complete,
      to: 'https://developers.cloudflare.com/workers/configuration/routing/custom-domains/',
      external: true
    },
    {
      key: 'images',
      title: 'Enable Image Transformations',
      complete: status.imageTransformations.complete,
      to: 'https://developers.cloudflare.com/images/optimization/transformations/overview/',
      external: true
    },
    {
      key: 'google',
      title: 'Configure Google OAuth',
      complete: status.googleOAuth.complete,
      to: '/_desk/settings/authentication'
    }
  ]
}

export function hasCompletedOnboarding(items: readonly Pick<OnboardingItem, 'complete'>[]) {
  return items.length === EXPECTED_ONBOARDING_ITEM_COUNT
    && items.every(item => item.complete)
}
