import type { PagePatternKey } from '~~/shared/page-patterns'
import type { PageBlockComponentKey } from './types'

export type PagePaletteItem =
  | { kind: 'block'; key: PageBlockComponentKey }
  | { kind: 'pattern'; key: PagePatternKey }
