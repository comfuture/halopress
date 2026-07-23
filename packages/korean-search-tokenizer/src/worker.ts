import { Garu } from 'garu-ko/browser'
import { createSearchTokenizer } from './index'

export * from './index'

let cachedTokenizer: Promise<ReturnType<typeof createSearchTokenizer>> | null = null

export function createWorkerTokenizer(modelData: ArrayBuffer) {
  cachedTokenizer ??= Garu.load({ modelData }).then(createSearchTokenizer)
  return cachedTokenizer
}

export function resetWorkerTokenizerForTests() {
  cachedTokenizer = null
}
