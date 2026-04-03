import type { PageBlockComponent, PageBlockRegistry } from './types'

const orientationOptions = [
  { label: 'Vertical', value: 'vertical' },
  { label: 'Horizontal', value: 'horizontal' }
]

const targetOptions = [
  { label: 'Same tab', value: '_self' },
  { label: 'New tab', value: '_blank' },
  { label: 'Parent', value: '_parent' },
  { label: 'Top', value: '_top' }
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
  { key: 'reverse', label: 'Reverse', type: 'boolean' },
  { key: 'links', label: 'Links (JSON)', type: 'json', help: 'Array of button props.' },
  { key: 'ui', label: 'UI (JSON)', type: 'json', help: 'Override component UI classes.' }
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
  ] },
  { key: 'links', label: 'Links (JSON)', type: 'json', help: 'Array of button props.' },
  { key: 'ui', label: 'UI (JSON)', type: 'json', help: 'Override component UI classes.' }
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
  { key: 'target', label: 'Link Target', type: 'select', options: targetOptions },
  { key: 'ui', label: 'UI (JSON)', type: 'json', help: 'Override component UI classes.' }
]

const components: PageBlockComponent[] = [
  {
    key: 'pageHero',
    label: 'Page Hero',
    componentName: 'UPageHero',
    defaultProps: {
      title: 'New Hero',
      description: ''
    },
    defaultMedia: {
      url: '',
      alt: ''
    },
    fields: heroFields
  },
  {
    key: 'pageCard',
    label: 'Page Card',
    componentName: 'UPageCard',
    defaultProps: {
      title: 'New Card',
      description: ''
    },
    defaultMedia: {
      url: '',
      alt: ''
    },
    fields: cardFields
  },
  {
    key: 'pageCTA',
    label: 'Page CTA',
    componentName: 'UPageCTA',
    defaultProps: {
      title: 'New CTA',
      description: ''
    },
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
