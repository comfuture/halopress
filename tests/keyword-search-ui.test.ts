import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync(new URL('../app/pages/search.vue', import.meta.url), 'utf8')
const component = readFileSync(
  new URL('../app/components/public/KeywordSearch.vue', import.meta.url),
  'utf8'
)
const composable = readFileSync(
  new URL('../app/composables/useKeywordSearch.ts', import.meta.url),
  'utf8'
)
const sitemap = readFileSync(new URL('../server/routes/sitemap.xml.get.ts', import.meta.url), 'utf8')

describe('public keyword search surface', () => {
  it('keeps query state shareable while canonicalizing and excluding result URLs', () => {
    expect(page).toContain('robots.value = \'noindex, follow\'')
    expect(page).toContain('robots: \'noindex, follow\'')
    expect(page).toContain('rel: \'canonical\', href: canonicalUrl')
    expect(page).toContain('nextQuery.q = query')
    expect(page).toContain('nextQuery.schema = schemaKeys.value.join(\',\')')
    expect(page).toContain('nextQuery.field = fieldIds.value.join(\',\')')
    expect(sitemap).toContain('listCanonicalPublicRoutes')
    expect(sitemap).not.toContain('/search')
  })

  it('exposes explicit loading, unavailable, partial, fallback, empty, retry, and pagination states', () => {
    expect(component).toContain('status === \'unavailable\'')
    expect(component).toContain('availability === \'partial\'')
    expect(component).toContain('v-if="fallback"')
    expect(component).toContain('isInitialLoading')
    expect(component).toContain('title="No results"')
    expect(component).toContain('@click="retrySearch"')
    expect(component).toContain('@click="loadMore"')
    expect(component).toContain('aria-live="polite"')
    expect(component).toContain('searchInput.value?.inputRef?.focus()')
    expect(component).toContain('animation="carousel"')
  })

  it('returns synchronous state fields and keeps the browser analyzer lazy', () => {
    expect(composable).toContain('await import(\'@halopress/korean-search-tokenizer/browser\')')
    expect(composable).toContain('onMounted(() =>')
    expect(composable).toContain('state: readonly(state)')
    expect(composable).not.toContain('export async function useKeywordSearch')
    expect(composable).not.toContain('...client')
  })
})
