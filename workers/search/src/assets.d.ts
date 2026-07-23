declare module '*.wasm' {
  const module: WebAssembly.Module
  export default module
}

declare module '*.gmdl' {
  const data: ArrayBuffer
  export default data
}
