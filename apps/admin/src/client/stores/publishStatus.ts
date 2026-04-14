import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api, type CompareResult, type TargetInfo } from '../api/client.js'

/**
 * Tracks publish state of every page/fragment relative to a "primary" target,
 * so SiteTree can show a dot next to items with unpublished changes.
 *
 * Picks the target automatically by environment: production → staging → local
 * (first match in that order). One dot, smart default — keeps the tree quiet
 * for the common case (one or two targets) without adding UI.
 *
 * Refreshes on: explicit refresh(), and (callers should invoke) on publish.
 * Silent on errors — a missing dot is better than a broken tree.
 */
export const usePublishStatusStore = defineStore('publishStatus', () => {
  const result = ref<CompareResult | null>(null)
  const target = ref<string | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  let activeAbort: AbortController | null = null

  const ENV_PRIORITY = ['production', 'staging', 'local'] as const

  /**
   * Pick the target whose state is most informative for the editor.
   * Strategy: try production → staging → local, but skip any that's never
   * been published to (firstPublish=true) so we don't drown the tree in
   * "everything is dirty" dots when the chosen target happens to be empty.
   * Falls back to the first listed target if no comparison succeeds.
   */
  async function pickInformativeTarget(targets: TargetInfo[], signal: AbortSignal): Promise<{ name: string; result: CompareResult } | null> {
    const ordered = [
      ...ENV_PRIORITY.flatMap(env => targets.filter(t => t.environment === env)),
      ...targets.filter(t => !ENV_PRIORITY.includes(t.environment as typeof ENV_PRIORITY[number])),
    ]
    let firstPublishCandidate: { name: string; result: CompareResult } | null = null
    for (const t of ordered) {
      try {
        const r = await api.compare(t.name, { signal })
        if (signal.aborted) return null
        if (!r.firstPublish) return { name: t.name, result: r }
        if (!firstPublishCandidate) firstPublishCandidate = { name: t.name, result: r }
      } catch (err) {
        if (signal.aborted || (err as Error).name === 'AbortError') return null
        // try next target
      }
    }
    return firstPublishCandidate
  }

  /** Items considered "out of sync" — added or modified locally vs target. */
  const dirtyPaths = computed<Set<string>>(() => {
    const s = new Set<string>()
    if (!result.value) return s
    for (const p of result.value.added) s.add(p)
    for (const p of result.value.modified) s.add(p)
    return s
  })

  function isPageDirty(name: string): boolean {
    return dirtyPaths.value.has(`pages/${name}`)
  }
  function isFragmentDirty(name: string): boolean {
    return dirtyPaths.value.has(`fragments/${name}`)
  }
  /** First publish — every local item is effectively "needs publish". */
  const isFirstPublish = computed(() => result.value?.firstPublish === true)

  async function refresh() {
    activeAbort?.abort()
    const ac = new AbortController()
    activeAbort = ac
    loading.value = true
    error.value = null
    try {
      const targets = await api.getTargets()
      if (ac.signal.aborted) return
      if (targets.length === 0) {
        target.value = null
        result.value = null
        return
      }
      const picked = await pickInformativeTarget(targets, ac.signal)
      if (ac.signal.aborted) return
      if (picked) {
        target.value = picked.name
        result.value = picked.result
      } else {
        target.value = null
        result.value = null
      }
    } catch (err) {
      if (ac.signal.aborted || (err as Error).name === 'AbortError') return
      error.value = (err as Error).message
      result.value = null
    } finally {
      if (!ac.signal.aborted) loading.value = false
    }
  }

  function clear() {
    activeAbort?.abort()
    result.value = null
    target.value = null
    error.value = null
    loading.value = false
  }

  return { result, target, loading, error, isPageDirty, isFragmentDirty, isFirstPublish, dirtyPaths, refresh, clear }
})
