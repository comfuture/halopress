import { copyFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const output = new URL('../src/generated-assets/', import.meta.url)
await mkdir(output, { recursive: true })

for (const [specifier, filename] of [
  ['garu-ko/worker/wasm-module', 'garu_wasm_bg.wasm'],
  ['garu-ko/worker/model', 'base.gmdl']
]) {
  await copyFile(
    fileURLToPath(import.meta.resolve(specifier)),
    fileURLToPath(new URL(filename, output))
  )
}
