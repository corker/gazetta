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

export const useActiveTargetStore = defineStore('activeTarget', () => {
  const targets = ref<TargetInfo[]>([])
  const activeTargetName = ref<string | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

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
      const list = await api.getTargets()
      targets.value = list

      // Prefer a persisted choice if it's still valid; otherwise pick default.
      const saved = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null
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

  /** Change the active target. Persists the choice to localStorage. */
  function setActiveTarget(name: string) {
    if (!targets.value.some(t => t.name === name)) {
      throw new Error(`Unknown target: ${name}`)
    }
    activeTargetName.value = name
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem(STORAGE_KEY, name) } catch { /* private mode */ }
    }
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
    load,
    setActiveTarget,
    clear,
  }
})
