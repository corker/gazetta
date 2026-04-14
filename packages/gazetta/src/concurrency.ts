/**
 * Bounded-concurrency helpers. Use these instead of `Promise.all` when the
 * input list can be large (site walks, sidecar listings, per-item publish
 * renders). Unbounded Promise.all hits three real limits at 10k items:
 *
 *   1. File-descriptor limits (macOS 256, Linux 1024) → EMFILE
 *   2. Cloud-storage rate limits (S3 3500 PUT/s, R2 Class A throttles)
 *   3. Memory — thousands of live promise chains + closures
 *
 * Default concurrency 20 balances throughput against those limits for both
 * local filesystem and cloud storage. Tune per-call via the second arg.
 */

export const DEFAULT_CONCURRENCY = 20

/**
 * Memoize a zero-arg async function until invalidate() is called. Concurrent
 * callers share a single in-flight promise (no thundering herd on cold
 * start). A failed call is NOT cached — the next call retries.
 *
 * Typical shape: a server owns the cache and exposes invalidate() to its
 * file watcher. Keeps the underlying scanner pure — no module-level state,
 * no surprise caching semantics when called from tests or the CLI.
 */
export interface Memoized<T> {
  get(): Promise<T>
  invalidate(): void
}
export function memoizeAsync<T>(fn: () => Promise<T>): Memoized<T> {
  let pending: Promise<T> | null = null
  let result: T | null = null
  let hasResult = false
  return {
    async get(): Promise<T> {
      if (hasResult) return result as T
      if (pending) return pending
      pending = (async () => {
        try {
          const v = await fn()
          result = v
          hasResult = true
          return v
        } finally {
          pending = null
        }
      })()
      return pending
    },
    invalidate(): void {
      hasResult = false
      result = null
      pending = null
    },
  }
}

/**
 * Run `fn` on every item with at most `limit` in flight at once. Results
 * are returned in input order. Errors reject immediately (like Promise.all)
 * but in-flight work still completes in the background.
 *
 * Preserves order even though completion order varies.
 */
export async function mapLimit<T, U>(
  items: readonly T[],
  fn: (item: T, index: number) => Promise<U>,
  limit = DEFAULT_CONCURRENCY,
): Promise<U[]> {
  const results = new Array<U>(items.length)
  let cursor = 0
  let firstError: unknown = null

  async function worker(): Promise<void> {
    while (cursor < items.length && firstError === null) {
      const i = cursor++
      try {
        results[i] = await fn(items[i], i)
      } catch (err) {
        if (firstError === null) firstError = err
        return
      }
    }
  }

  const workerCount = Math.min(limit, items.length)
  await Promise.all(Array.from({ length: workerCount }, worker))
  if (firstError !== null) throw firstError
  return results
}

/**
 * Run `fn` on every item with at most `limit` in flight, yielding each
 * result as it completes — in completion order, not input order. Use when
 * the caller wants to react to each completion as it happens (e.g. emit
 * a progress event mid-stream). For collect-all-then-return semantics,
 * mapLimit is simpler.
 *
 * Each yield includes the original `index` so the consumer can reconstruct
 * input order if needed.
 */
export async function* mapLimitStream<T, U>(
  items: readonly T[],
  fn: (item: T, index: number) => Promise<U>,
  limit = DEFAULT_CONCURRENCY,
): AsyncGenerator<{ item: T; result: U; index: number }> {
  type Settled = { item: T; result: U; index: number; self: symbol }
  // Each task gets a unique id — lets us remove from `active` by lookup
  // without relying on Promise identity (which Promise.race doesn't give
  // us directly).
  const active = new Map<symbol, Promise<Settled>>()
  let next = 0

  function start(): void {
    if (next >= items.length) return
    const i = next++
    const item = items[i]
    const self = Symbol()
    const p = fn(item, i).then((result): Settled => ({ item, result, index: i, self }))
    active.set(self, p)
  }

  for (let i = 0; i < Math.min(limit, items.length); i++) start()
  while (active.size > 0) {
    // Promise.race resolves with the first settled value (and rejects on
    // the first rejection — so errors propagate naturally).
    const settled = await Promise.race(active.values())
    active.delete(settled.self)
    yield { item: settled.item, result: settled.result, index: settled.index }
    start()
  }
}

/**
 * Like mapLimit but doesn't throw on individual failures — returns a parallel
 * array of { ok: true, value } or { ok: false, error } per input. Useful
 * when a single bad manifest shouldn't abort a whole site walk.
 */
export async function mapLimitSettled<T, U>(
  items: readonly T[],
  fn: (item: T, index: number) => Promise<U>,
  limit = DEFAULT_CONCURRENCY,
): Promise<Array<{ ok: true; value: U } | { ok: false; error: unknown }>> {
  const results = new Array<{ ok: true; value: U } | { ok: false; error: unknown }>(items.length)
  let cursor = 0

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const i = cursor++
      try {
        const value = await fn(items[i], i)
        results[i] = { ok: true, value }
      } catch (error) {
        results[i] = { ok: false, error }
      }
    }
  }

  const workerCount = Math.min(limit, items.length)
  await Promise.all(Array.from({ length: workerCount }, worker))
  return results
}
