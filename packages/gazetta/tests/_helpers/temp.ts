import { resolve } from 'node:path'

/**
 * Resolve a temp path under the repo root's `.tmp/` directory.
 *
 * Centralizing test temp files in the repo (instead of os.tmpdir()) makes
 * them visible, easy to inspect, and trivially wipeable via `rm -rf .tmp`.
 * The `.tmp/` directory is gitignored at the repo root.
 *
 * Each test file should pass a unique name (typically derived from the suite name)
 * and append a timestamp if it wants isolation across concurrent runs.
 *
 * Example:
 *   const root = tempDir('compare-test')                       // -> {repo}/.tmp/compare-test
 *   const root = tempDir('compare-test-' + Date.now())         // -> unique per run
 */
export function tempDir(name: string): string {
  // repo root is 3 levels up from this file: tests/_helpers → tests → packages/gazetta → repo
  return resolve(import.meta.dirname, '../../../..', '.tmp', name)
}
