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
