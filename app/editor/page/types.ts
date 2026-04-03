export type PageBlockComponentKey = 'pageHero' | 'pageCard' | 'pageCTA'

export type PageBlockMedia = {
  url?: string
  alt?: string
  width?: number
  height?: number
  class?: string
}

export type PageBlockAttrs = {
  component: PageBlockComponentKey
  props: Record<string, any>
  advanced: Record<string, any>
  media: PageBlockMedia
}

export type PageBlockFieldType = 'text' | 'textarea' | 'select' | 'boolean' | 'json' | 'url'

export type PageBlockField = {
  key: string
  label: string
  type: PageBlockFieldType
  options?: Array<{ label: string; value: string }>
  placeholder?: string
  help?: string
}

export type PageBlockComponent = {
  key: PageBlockComponentKey
  label: string
  componentName: string
  defaultProps: Record<string, any>
  defaultMedia: PageBlockMedia
  fields: PageBlockField[]
}

export type PageBlockRegistry = {
  components: PageBlockComponent[]
  byKey: Record<PageBlockComponentKey, PageBlockComponent>
}
