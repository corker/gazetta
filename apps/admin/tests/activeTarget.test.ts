/**
 * Unit tests for the active-target store.
 *
 * These run without a browser: Pinia is instantiated in-process, the api
 * client's getTargets is mocked, and localStorage is stubbed via a plain
 * Map wrapper so the store's persistence path executes.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { TargetInfo } from '../src/client/api/client.js'

// Mock the api client before importing the store (store imports it at module init).
vi.mock('../src/client/api/client.js', () => ({
  api: {
    getTargets: vi.fn(),
  },
}))

// Stub localStorage — vitest default environment is node, no window.
const localStorageMap = new Map<string, string>()
;(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => localStorageMap.get(k) ?? null,
    setItem: (k: string, v: string) => { localStorageMap.set(k, v) },
    removeItem: (k: string) => { localStorageMap.delete(k) },
  },
}

const { useActiveTargetStore } = await import('../src/client/stores/activeTarget.js')
const apiModule = await import('../src/client/api/client.js')
const mockGetTargets = apiModule.api.getTargets as ReturnType<typeof vi.fn>

const TARGETS: TargetInfo[] = [
  { name: 'local', environment: 'local', type: 'static', editable: true },
  { name: 'staging', environment: 'staging', type: 'static', editable: false },
  { name: 'prod', environment: 'production', type: 'static', editable: false },
]

beforeEach(() => {
  setActivePinia(createPinia())
  localStorageMap.clear()
  mockGetTargets.mockReset()
})

afterEach(() => {
  mockGetTargets.mockReset()
})

describe('useActiveTargetStore', () => {
  it('picks the first editable target by default', async () => {
    mockGetTargets.mockResolvedValue(TARGETS)
    const store = useActiveTargetStore()
    await store.load()
    expect(store.activeTargetName).toBe('local')
    expect(store.activeTarget?.environment).toBe('local')
  })

  it('falls back to the first target when none are editable', async () => {
    const readOnly: TargetInfo[] = [
      { name: 'staging', environment: 'staging', type: 'static', editable: false },
      { name: 'prod', environment: 'production', type: 'static', editable: false },
    ]
    mockGetTargets.mockResolvedValue(readOnly)
    const store = useActiveTargetStore()
    await store.load()
    expect(store.activeTargetName).toBe('staging')
  })

  it('restores a persisted active target from localStorage', async () => {
    localStorageMap.set('gazetta_active_target', 'staging')
    mockGetTargets.mockResolvedValue(TARGETS)
    const store = useActiveTargetStore()
    await store.load()
    expect(store.activeTargetName).toBe('staging')
  })

  it('ignores a stale persisted target that is not in the current list', async () => {
    localStorageMap.set('gazetta_active_target', 'no-longer-exists')
    mockGetTargets.mockResolvedValue(TARGETS)
    const store = useActiveTargetStore()
    await store.load()
    // Falls back to default (first editable)
    expect(store.activeTargetName).toBe('local')
  })

  it('setActiveTarget updates the store and persists the choice', async () => {
    mockGetTargets.mockResolvedValue(TARGETS)
    const store = useActiveTargetStore()
    await store.load()
    store.setActiveTarget('prod')
    expect(store.activeTargetName).toBe('prod')
    expect(localStorageMap.get('gazetta_active_target')).toBe('prod')
  })

  it('setActiveTarget throws on unknown target', async () => {
    mockGetTargets.mockResolvedValue(TARGETS)
    const store = useActiveTargetStore()
    await store.load()
    expect(() => store.setActiveTarget('missing')).toThrow(/Unknown target/)
  })

  it('isActiveEditable reflects the active target', async () => {
    mockGetTargets.mockResolvedValue(TARGETS)
    const store = useActiveTargetStore()
    await store.load()
    expect(store.isActiveEditable).toBe(true)     // local is editable
    store.setActiveTarget('prod')
    expect(store.isActiveEditable).toBe(false)
  })

  it('editableTargets and readOnlyTargets partition the list', async () => {
    mockGetTargets.mockResolvedValue(TARGETS)
    const store = useActiveTargetStore()
    await store.load()
    expect(store.editableTargets.map(t => t.name)).toEqual(['local'])
    expect(store.readOnlyTargets.map(t => t.name)).toEqual(['staging', 'prod'])
  })

  it('sets error and leaves state clean when getTargets fails', async () => {
    mockGetTargets.mockRejectedValue(new Error('boom'))
    const store = useActiveTargetStore()
    await store.load()
    expect(store.error).toBe('boom')
    expect(store.targets).toEqual([])
    expect(store.activeTargetName).toBe(null)
  })

  it('clear() resets state', async () => {
    mockGetTargets.mockResolvedValue(TARGETS)
    const store = useActiveTargetStore()
    await store.load()
    expect(store.activeTargetName).toBe('local')
    store.clear()
    expect(store.targets).toEqual([])
    expect(store.activeTargetName).toBe(null)
    expect(store.error).toBe(null)
  })
})
