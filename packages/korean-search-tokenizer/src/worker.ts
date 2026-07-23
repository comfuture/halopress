import { GaruBase } from 'garu-ko/worker/core'
import { GaruWasm, initSync } from 'garu-ko/worker/wasm'
import { createSearchTokenizer } from './index'

export * from './index'

let cachedTokenizer: Promise<ReturnType<typeof createSearchTokenizer>> | null = null

class WorkerGaru extends GaruBase {
  constructor(wasmInstance: GaruWasm, modelSize: number) {
    super(wasmInstance, modelSize)
  }
}

export function createWorkerTokenizer(assets: {
  wasmModule: WebAssembly.Module
  modelData: ArrayBuffer
}) {
  cachedTokenizer ??= Promise.resolve().then(() => {
    initSync({ module: assets.wasmModule })
    const modelBytes = new Uint8Array(assets.modelData)
    return createSearchTokenizer(new WorkerGaru(
      new GaruWasm(modelBytes, false),
      modelBytes.byteLength
    ))
  }).catch((error) => {
    cachedTokenizer = null
    throw error
  })
  return cachedTokenizer
}

export function resetWorkerTokenizerForTests() {
  cachedTokenizer = null
}
