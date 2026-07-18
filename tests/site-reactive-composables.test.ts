import { computed, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

type AsyncDataStatus = 'idle' | 'pending' | 'success' | 'error'

function createNuxtLikeAsyncData<T>() {
  const state = {
    data: ref<T>(),
    pending: ref(true),
    status: ref<AsyncDataStatus>('pending'),
    error: ref<unknown>(),
    refresh: vi.fn(async () => {}),
    execute: vi.fn(async () => {}),
    clear: vi.fn()
  }
  const promise = Object.assign(Promise.resolve(state), state)

  // Nuxt exposes these Promise methods as enumerable own properties. A spread
  // of the raw result therefore remains thenable and is unsafe for wrappers.
  Object.defineProperties(promise, {
    then: { enumerable: true, value: promise.then.bind(promise) },
    catch: { enumerable: true, value: promise.catch.bind(promise) },
    finally: { enumerable: true, value: promise.finally.bind(promise) }
  })

  return { state, promise }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Site reactive composables', () => {
  it('exposes Site mode refs synchronously without leaking Nuxt thenable methods', async () => {
    const { state, promise } = createNuxtLikeAsyncData<{
      value: { version: 1; enabled: boolean }
    }>()
    const useFetch = vi.fn(() => promise)
    vi.stubGlobal('computed', computed)
    vi.stubGlobal('ref', ref)
    vi.stubGlobal('useFetch', useFetch)

    const { useSiteMode, useSiteModeSettings } = await import('../app/composables/useSiteModeSettings')
    const mode = useSiteMode()

    expect(Object.keys(promise)).toContain('then')
    expect(mode).not.toHaveProperty('then')
    expect(mode.data).toBe(state.data)
    expect(mode.pending.value).toBe(true)
    expect(mode.enabled.value).toBe(false)
    expect(useFetch).toHaveBeenLastCalledWith('/api/settings/site-mode', {
      key: 'site-mode',
      dedupe: 'defer'
    })

    state.data.value = { value: { version: 1, enabled: true } }
    expect(mode.enabled.value).toBe(true)

    const settings = useSiteModeSettings()
    expect(settings).not.toHaveProperty('then')
    expect(settings.saving.value).toBe(false)
  })

  it('keeps the overview status synchronous and the mutable presentation editor awaited', async () => {
    const { state, promise } = createNuxtLikeAsyncData<{ configured: boolean }>()
    const useFetch = vi.fn(() => promise)
    const updated = { configured: true }
    const updatePresentation = vi.fn(async () => updated)
    const refreshNuxtData = vi.fn(async () => {})
    vi.stubGlobal('ref', ref)
    vi.stubGlobal('useFetch', useFetch)
    vi.stubGlobal('$fetch', updatePresentation)
    vi.stubGlobal('refreshNuxtData', refreshNuxtData)

    const {
      useSitePresentationSettings,
      useSitePresentationStatus
    } = await import('../app/composables/useSitePresentationSettings')
    const status = useSitePresentationStatus()

    expect(status).not.toHaveProperty('then')
    expect(status.data).toBe(state.data)
    expect(status.pending.value).toBe(true)
    expect(useFetch).toHaveBeenLastCalledWith('/api/settings/site-presentation', {
      key: 'site-presentation-settings',
      dedupe: 'defer'
    })

    const editor = useSitePresentationSettings()
    expect(editor).toBeInstanceOf(Promise)
    const editorState = await editor
    expect(editorState).toMatchObject({
      data: state.data,
      pending: state.pending,
      saving: expect.objectContaining({ value: false })
    })

    await editorState.savePatch({})
    expect(state.data.value).toEqual(updated)
    expect(updatePresentation).toHaveBeenCalledWith('/api/settings/site-presentation', {
      method: 'PUT',
      body: {}
    })
    expect(refreshNuxtData).toHaveBeenCalledWith('site-presentation')
  })
})
