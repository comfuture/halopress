import type { PageBlockComponent, PageBlockRegistry } from './types'
import { pageBlockDefinitions } from '~~/shared/page-blocks'

const orientationOptions = [
  { label: 'Vertical', value: 'vertical' },
  { label: 'Horizontal', value: 'horizontal' }
]

const targetOptions = [
  { label: 'Same tab', value: '_self' },
  { label: 'New tab', value: '_blank' }
]

const colorOptions = [
  { label: 'Primary', value: 'primary' },
  { label: 'Secondary', value: 'secondary' },
  { label: 'Success', value: 'success' },
  { label: 'Info', value: 'info' },
  { label: 'Warning', value: 'warning' },
  { label: 'Error', value: 'error' },
  { label: 'Neutral', value: 'neutral' }
]

const heroFields: PageBlockComponent['fields'] = [
  { key: 'headline', label: 'Headline', type: 'text' },
  { key: 'title', label: 'Title', type: 'text' },
  { key: 'description', label: 'Description', type: 'textarea' },
  { key: 'orientation', label: 'Orientation', type: 'select', options: orientationOptions },
  { key: 'reverse', label: 'Reverse', type: 'boolean' }
]

const ctaFields: PageBlockComponent['fields'] = [
  { key: 'title', label: 'Title', type: 'text' },
  { key: 'description', label: 'Description', type: 'textarea' },
  { key: 'orientation', label: 'Orientation', type: 'select', options: orientationOptions },
  { key: 'reverse', label: 'Reverse', type: 'boolean' },
  { key: 'variant', label: 'Variant', type: 'select', options: [
    { label: 'Outline', value: 'outline' },
    { label: 'Solid', value: 'solid' },
    { label: 'Soft', value: 'soft' },
    { label: 'Subtle', value: 'subtle' },
    { label: 'Naked', value: 'naked' }
  ] }
]

const cardFields: PageBlockComponent['fields'] = [
  { key: 'icon', label: 'Icon', type: 'text', help: 'Icon name, e.g. i-lucide-sparkles' },
  { key: 'title', label: 'Title', type: 'text' },
  { key: 'description', label: 'Description', type: 'textarea' },
  { key: 'orientation', label: 'Orientation', type: 'select', options: orientationOptions },
  { key: 'reverse', label: 'Reverse', type: 'boolean' },
  { key: 'variant', label: 'Variant', type: 'select', options: [
    { label: 'Solid', value: 'solid' },
    { label: 'Outline', value: 'outline' },
    { label: 'Soft', value: 'soft' },
    { label: 'Subtle', value: 'subtle' },
    { label: 'Ghost', value: 'ghost' },
    { label: 'Naked', value: 'naked' }
  ] },
  { key: 'highlight', label: 'Highlight', type: 'boolean' },
  { key: 'highlightColor', label: 'Highlight Color', type: 'select', options: colorOptions },
  { key: 'spotlight', label: 'Spotlight', type: 'boolean' },
  { key: 'spotlightColor', label: 'Spotlight Color', type: 'select', options: colorOptions },
  { key: 'to', label: 'Link To', type: 'url', placeholder: 'https://' },
  { key: 'target', label: 'Link Target', type: 'select', options: targetOptions }
]

const components: PageBlockComponent[] = [
  {
    key: 'pageHero',
    label: 'Page Hero',
    componentName: pageBlockDefinitions.pageHero.componentName,
    defaultProps: pageBlockDefinitions.pageHero.defaultProps,
    defaultMedia: {
      url: '',
      alt: ''
    },
    fields: heroFields
  },
  {
    key: 'pageCard',
    label: 'Page Card',
    componentName: pageBlockDefinitions.pageCard.componentName,
    defaultProps: pageBlockDefinitions.pageCard.defaultProps,
    defaultMedia: {
      url: '',
      alt: ''
    },
    fields: cardFields
  },
  {
    key: 'pageCTA',
    label: 'Page CTA',
    componentName: pageBlockDefinitions.pageCTA.componentName,
    defaultProps: pageBlockDefinitions.pageCTA.defaultProps,
    defaultMedia: {
      url: '',
      alt: ''
    },
    fields: ctaFields
  }
]

export const pageBlockRegistry: PageBlockRegistry = {
  components,
  byKey: components.reduce((acc, item) => {
    acc[item.key] = item
    return acc
  }, {} as PageBlockRegistry['byKey'])
}

export function getPageBlockComponent(key: string | undefined) {
  if (!key) return null
  return pageBlockRegistry.byKey[key as keyof typeof pageBlockRegistry.byKey] ?? null
}
