/**
 * Active target — the single UX spine.
 *
 * Exactly one target is "active" at any moment. Tree, editor, preview, sync
 * indicators, publish defaults all orient around it. The active target can
 * be editable (author can save) or read-only (author can inspect). Switching
 * is cheap and reversible — never a commitment.
 *
 * Today this store is a pure in-browser model: API calls still go through
 * the single admin app (which is already bound to the default editable
 * target server-side). Later, API calls can pass ?target=<name> once the
 * admin API routes support per-target reads; this store is the client-side
 * source of truth for "which target is the author focused on right now."
 *
 * Persistence: activeTargetName is saved to localStorage so the author's
 * choice survives reloads.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api, type TargetInfo } from '../api/client.js'

const STORAGE_KEY = 'gazetta_active_target'

/**
 * How the store obtains its list of targets. Injected so tests (and any
 * future multi-source setups) can swap the transport without mocking the
 * api client module.
 */
export type LoadTargets = () => Promise<TargetInfo[]>

/**
 * How the store persists the active target across reloads. Injected so
 * tests (and non-browser environments) can stub without touching globals.
 */
export interface ActiveTargetPersistence {
  get(): string | null
  set(name: string): void
}

/** Default persistence backed by window.localStorage. No-op outside a browser. */
const defaultPersistence: ActiveTargetPersistence = {
  get() {
    if (typeof window === 'undefined') return null
    try { return window.localStorage.getItem(STORAGE_KEY) } catch { return null }
  },
  set(name: string) {
    if (typeof window === 'undefined') return
    try { window.localStorage.setItem(STORAGE_KEY, name) } catch { /* private mode */ }
  },
}

export interface ActiveTargetStoreOptions {
  /** Override how the store loads its target list. Defaults to `api.getTargets()`. */
  loadTargets?: LoadTargets
  /** Override persistence of the active target name. Defaults to localStorage. */
  persistence?: ActiveTargetPersistence
}

/**
 * Pinia store for the active target. Accepts optional dependencies so tests
 * can wire in their own loaders and persistence without touching module
 * imports. In production both default to api.getTargets + localStorage.
 */
export const useActiveTargetStore = defineStore('activeTarget', () => {
  const targets = ref<TargetInfo[]>([])
  const activeTargetName = ref<string | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Injected dependencies. Default to production wiring; tests (and any
  // future alternative backend) call configure() before load().
  let loadTargetsFn: LoadTargets = () => api.getTargets()
  let persistence: ActiveTargetPersistence = defaultPersistence

  /** Override the loader and/or persistence — call before load(). */
  function configure(opts: ActiveTargetStoreOptions) {
    if (opts.loadTargets) loadTargetsFn = opts.loadTargets
    if (opts.persistence) persistence = opts.persistence
  }

  /** The full TargetInfo for the active target, or null if not loaded / not found. */
  const activeTarget = computed<TargetInfo | null>(() => {
    if (!activeTargetName.value) return null
    return targets.value.find(t => t.name === activeTargetName.value) ?? null
  })

  /** Whether the author can write to the active target. */
  const isActiveEditable = computed(() => activeTarget.value?.editable ?? false)

  /** All editable targets, in declaration order. */
  const editableTargets = computed(() => targets.value.filter(t => t.editable))

  /** All read-only targets, in declaration order. */
  const readOnlyTargets = computed(() => targets.value.filter(t => !t.editable))

  /**
   * Pick a sensible default when no saved preference exists:
   * first editable target, or first target, or null.
   */
  function pickDefault(list: TargetInfo[]): string | null {
    const editable = list.find(t => t.editable)
    if (editable) return editable.name
    return list[0]?.name ?? null
  }

  /** Load the list of targets and resolve the active target name. */
  async function load() {
    loading.value = true
    error.value = null
    try {
      const list = await loadTargetsFn()
      targets.value = list

      // Prefer a persisted choice if it's still valid; otherwise pick default.
      const saved = persistence.get()
      if (saved && list.some(t => t.name === saved)) {
        activeTargetName.value = saved
      } else {
        activeTargetName.value = pickDefault(list)
      }
    } catch (err) {
      error.value = (err as Error).message
      targets.value = []
      activeTargetName.value = null
    } finally {
      loading.value = false
    }
  }

  /** Change the active target. Persists the choice via the configured persistence. */
  function setActiveTarget(name: string) {
    if (!targets.value.some(t => t.name === name)) {
      throw new Error(`Unknown target: ${name}`)
    }
    activeTargetName.value = name
    persistence.set(name)
  }

  /** Clear the store (e.g., on logout or site switch). */
  function clear() {
    targets.value = []
    activeTargetName.value = null
    loading.value = false
    error.value = null
  }

  return {
    // state
    targets,
    activeTargetName,
    loading,
    error,
    // getters
    activeTarget,
    isActiveEditable,
    editableTargets,
    readOnlyTargets,
    // actions
    configure,
    load,
    setActiveTarget,
    clear,
  }
})
