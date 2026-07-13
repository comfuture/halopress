import type { PageBlockComponentKey } from '~~/shared/page-blocks'

export type { PageBlockComponentKey } from '~~/shared/page-blocks'

export type PageBlockMedia = {
  url?: string
  alt?: string
  width?: number
  height?: number
}

export type PageBlockAttrs = {
  component: string
  props: Record<string, unknown>
  advanced: Record<string, unknown>
  media: PageBlockMedia
}

export type PageBlockFieldType = 'text' | 'textarea' | 'select' | 'boolean' | 'url' | 'link-list'

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
  defaultProps: Record<string, unknown>
  defaultMedia: PageBlockMedia
  fields: PageBlockField[]
}

export type PageBlockRegistry = {
  components: PageBlockComponent[]
  byKey: Record<PageBlockComponentKey, PageBlockComponent>
}
