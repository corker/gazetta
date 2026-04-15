/**
 * Aggregate compare results across (source, [destinations]) into a single
 * item list for the Publish panel. Each item carries its per-destination
 * state so the UI can render:
 *
 *   ● pages/home            modified on staging, in sync on prod
 *   + pages/pricing         added (not yet on either)
 *   − pages/old-launch      exists on prod but not locally
 *
 * This composable owns the aggregation logic; the list component renders
 * it. Separating the two keeps SRP clean and makes the aggregation
 * testable in isolation later.
 */
import { ref, computed, watch } from 'vue'
import { api, type CompareResult } from '../api/client.js'

/** State of one item relative to one destination. */
export type ItemChangeKind = 'added' | 'modified' | 'deleted' | 'unchanged'

export interface ItemRow {
  /** Item path, e.g., "pages/home" or "fragments/header" */
  path: string
  /** Kind by destination name. Missing key means that destination has
   *  no information for this item (shouldn't happen once compare resolves). */
  byDestination: Record<string, ItemChangeKind>
  /** Aggregated kind — what color/icon to show in the "summary" column:
   *    'deleted'  if deleted anywhere
   *    'added'    if added to ≥1 destination AND not modified/deleted anywhere
   *    'modified' otherwise when ≥1 destination differs
   *    'unchanged' when every destination is in sync */
  summary: ItemChangeKind
  /** True if at least one destination reports a change (added/modified/deleted). */
  hasChanges: boolean
}

function summarize(byDest: Record<string, ItemChangeKind>): ItemChangeKind {
  const kinds = Object.values(byDest)
  if (kinds.includes('deleted')) return 'deleted'
  const changed = kinds.filter(k => k !== 'unchanged')
  if (changed.length === 0) return 'unchanged'
  if (changed.every(k => k === 'added')) return 'added'
  return 'modified'
}

function classifyInResult(item: string, r: CompareResult): ItemChangeKind {
  if (r.added.includes(item)) return 'added'
  if (r.modified.includes(item)) return 'modified'
  if (r.deleted.includes(item)) return 'deleted'
  return 'unchanged'
}

/**
 * Reactive aggregator. Takes source + destinations as computed refs;
 * re-runs compare whenever either changes. Returns items + loading +
 * error state for the UI.
 */
export function usePublishItems(
  source: () => string | null,
  destinations: () => string[],
) {
  /** One CompareResult per destination name. */
  const results = ref(new Map<string, CompareResult>())
  const loading = ref(false)
  const error = ref<string | null>(null)
  let activeAbort: AbortController | null = null

  async function refresh() {
    const src = source()
    const dests = destinations()
    if (!src || dests.length === 0) {
      results.value = new Map()
      return
    }
    activeAbort?.abort()
    const ac = new AbortController()
    activeAbort = ac
    loading.value = true
    error.value = null
    try {
      const entries = await Promise.all(dests.map(async (name) => {
        const r = await api.compare(name, { source: src, signal: ac.signal })
        return [name, r] as const
      }))
      if (ac.signal.aborted) return
      const next = new Map<string, CompareResult>()
      for (const [name, r] of entries) next.set(name, r)
      results.value = next
    } catch (err) {
      if (ac.signal.aborted || (err as Error).name === 'AbortError') return
      error.value = (err as Error).message
      results.value = new Map()
    } finally {
      if (!ac.signal.aborted) loading.value = false
    }
  }

  // Re-run on source or destinations change.
  watch([source, () => [...destinations()]], refresh, { immediate: true })

  const items = computed<ItemRow[]>(() => {
    // Collect every item that appears in any destination's compare.
    const paths = new Set<string>()
    const dests: string[] = []
    for (const [name, r] of results.value) {
      dests.push(name)
      for (const p of r.added) paths.add(p)
      for (const p of r.modified) paths.add(p)
      for (const p of r.deleted) paths.add(p)
      // Skip `unchanged` — including them would drown the list with every
      // page in the site; author wants to see what would be published.
    }
    const rows: ItemRow[] = []
    for (const path of paths) {
      const byDestination: Record<string, ItemChangeKind> = {}
      for (const d of dests) {
        const r = results.value.get(d)!
        byDestination[d] = classifyInResult(path, r)
      }
      const summary = summarize(byDestination)
      rows.push({
        path,
        byDestination,
        summary,
        hasChanges: summary !== 'unchanged',
      })
    }
    // Stable sort: modified first, then added, then deleted, then
    // unchanged (shouldn't appear but defensive). Within each, alpha.
    const order: Record<ItemChangeKind, number> = { modified: 0, added: 1, deleted: 2, unchanged: 3 }
    rows.sort((a, b) => {
      const k = order[a.summary] - order[b.summary]
      return k !== 0 ? k : a.path.localeCompare(b.path)
    })
    return rows
  })

  return {
    items,
    results,
    loading,
    error,
    refresh,
  }
}
