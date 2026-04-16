/**
 * Unit tests for the active-target store.
 *
 * The store accepts injected `loadTargets` and `persistence` dependencies
 * via `configure()` — no module mocks, no global stubs needed.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { TargetInfo } from '../src/client/api/client.js'
import {
  useActiveTargetStore,
  type ActiveTargetPersistence,
  type LoadTargets,
} from '../src/client/stores/activeTarget.js'

const TARGETS: TargetInfo[] = [
  { name: 'local', environment: 'local', type: 'static', editable: true },
  { name: 'staging', environment: 'staging', type: 'static', editable: false },
  { name: 'prod', environment: 'production', type: 'static', editable: false },
]

/** In-memory persistence for tests — no globals, no localStorage. */
function memoryPersistence(initial: string | null = null): ActiveTargetPersistence & { value: string | null } {
  const state = { value: initial }
  return {
    get: () => state.value,
    set: (name: string) => {
      state.value = name
    },
    get value() {
      return state.value
    },
  }
}

/** Resolved loader for a fixed target list. */
function fixedLoader(list: TargetInfo[]): LoadTargets {
  return async () => list
}

/** Rejected loader for error-path tests. */
function failingLoader(message: string): LoadTargets {
  return async () => {
    throw new Error(message)
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('useActiveTargetStore', () => {
  it('picks the first editable target by default', async () => {
    const store = useActiveTargetStore()
    store.configure({ loadTargets: fixedLoader(TARGETS), persistence: memoryPersistence() })
    await store.load()
    expect(store.activeTargetName).toBe('local')
    expect(store.activeTarget?.environment).toBe('local')
  })

  it('falls back to the first target when none are editable', async () => {
    const readOnly: TargetInfo[] = [
      { name: 'staging', environment: 'staging', type: 'static', editable: false },
      { name: 'prod', environment: 'production', type: 'static', editable: false },
    ]
    const store = useActiveTargetStore()
    store.configure({ loadTargets: fixedLoader(readOnly), persistence: memoryPersistence() })
    await store.load()
    expect(store.activeTargetName).toBe('staging')
  })

  it('restores a persisted active target from persistence', async () => {
    const store = useActiveTargetStore()
    store.configure({ loadTargets: fixedLoader(TARGETS), persistence: memoryPersistence('staging') })
    await store.load()
    expect(store.activeTargetName).toBe('staging')
  })

  it('ignores a stale persisted target that is not in the current list', async () => {
    const store = useActiveTargetStore()
    store.configure({ loadTargets: fixedLoader(TARGETS), persistence: memoryPersistence('no-longer-exists') })
    await store.load()
    expect(store.activeTargetName).toBe('local')
  })

  it('setActiveTarget updates the store and persists the choice', async () => {
    const persistence = memoryPersistence()
    const store = useActiveTargetStore()
    store.configure({ loadTargets: fixedLoader(TARGETS), persistence })
    await store.load()
    store.setActiveTarget('prod')
    expect(store.activeTargetName).toBe('prod')
    expect(persistence.value).toBe('prod')
  })

  it('setActiveTarget throws on unknown target', async () => {
    const store = useActiveTargetStore()
    store.configure({ loadTargets: fixedLoader(TARGETS), persistence: memoryPersistence() })
    await store.load()
    expect(() => store.setActiveTarget('missing')).toThrow(/Unknown target/)
  })

  it('isActiveEditable reflects the active target', async () => {
    const store = useActiveTargetStore()
    store.configure({ loadTargets: fixedLoader(TARGETS), persistence: memoryPersistence() })
    await store.load()
    expect(store.isActiveEditable).toBe(true)
    store.setActiveTarget('prod')
    expect(store.isActiveEditable).toBe(false)
  })

  it('editableTargets and readOnlyTargets partition the list', async () => {
    const store = useActiveTargetStore()
    store.configure({ loadTargets: fixedLoader(TARGETS), persistence: memoryPersistence() })
    await store.load()
    expect(store.editableTargets.map(t => t.name)).toEqual(['local'])
    expect(store.readOnlyTargets.map(t => t.name)).toEqual(['staging', 'prod'])
  })

  it('sets error and leaves state clean when loadTargets fails', async () => {
    const store = useActiveTargetStore()
    store.configure({ loadTargets: failingLoader('boom'), persistence: memoryPersistence() })
    await store.load()
    expect(store.error).toBe('boom')
    expect(store.targets).toEqual([])
    expect(store.activeTargetName).toBe(null)
  })

  it('clear() resets state', async () => {
    const store = useActiveTargetStore()
    store.configure({ loadTargets: fixedLoader(TARGETS), persistence: memoryPersistence() })
    await store.load()
    expect(store.activeTargetName).toBe('local')
    store.clear()
    expect(store.targets).toEqual([])
    expect(store.activeTargetName).toBe(null)
    expect(store.error).toBe(null)
  })

  it('configure() is optional — defaults wire api.getTargets + localStorage', async () => {
    // Just verify the store constructs without configure() and the shape is intact.
    // The production path is exercised by the running admin server; we don't try
    // to mock localStorage or the api client here.
    const store = useActiveTargetStore()
    expect(store.activeTargetName).toBe(null)
    expect(store.targets).toEqual([])
    expect(typeof store.load).toBe('function')
    expect(typeof store.configure).toBe('function')
  })
})
