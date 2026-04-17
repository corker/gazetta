/**
 * Sidecar file I/O for pages and fragments — one module owning all reads
 * and writes of the three sidecar kinds:
 *
 *   .{8hex}.hash           — content hash, used by compare-targets
 *   .uses-{fragment}       — one per @ reference; used by dependents lookup
 *   .tpl-{template}        — template name; used to flag republish-needed
 *
 * Filenames encode the whole picture — a single readDir returns the full
 * dependency state of an item without any content reads. Scaling goal:
 * listing calls, not GETs, at 10k pages.
 *
 * Publish-rendered.ts, compare.ts, publish.ts all used to inline this
 * logic separately; centralizing here reduces duplication and gives us
 * one place to swap the storage shape (e.g. future single-index file)
 * without touching every caller.
 */

import type { StorageProvider } from './types.js'
import {
  parseSidecarName,
  sidecarNameFor,
  parseUsesSidecarName,
  usesSidecarNameFor,
  parseTemplateSidecarName,
  templateSidecarNameFor,
  parsePubSidecarName,
  pubSidecarNameFor,
  type PubSidecar,
} from './hash.js'
import { mapLimit } from './concurrency.js'

/** Full sidecar state for one page or fragment. */
export interface SidecarState {
  hash: string
  uses: string[]
  template: string | null
  /** Publish timestamp + noindex flag. Present only on target sidecars
   *  written by the publish pipeline; absent on source-side sidecars. */
  pub: PubSidecar | null
}

/**
 * Read sidecar filenames for a single item directory. Returns null if
 * the directory doesn't exist or has no hash sidecar. `uses` and
 * `template` default to empty/null when their sidecars are absent —
 * old items published before we started writing them will still work,
 * the caller just won't have dependency info for them.
 */
export async function readSidecars(storage: StorageProvider, dir: string): Promise<SidecarState | null> {
  let entries
  try {
    entries = await storage.readDir(dir)
  } catch {
    return null
  }
  let hash: string | null = null
  const uses: string[] = []
  let template: string | null = null
  let pub: PubSidecar | null = null
  for (const e of entries) {
    if (e.isDirectory) continue
    const h = parseSidecarName(e.name)
    if (h) {
      hash = h
      continue
    }
    const u = parseUsesSidecarName(e.name)
    if (u) {
      uses.push(u)
      continue
    }
    const t = parseTemplateSidecarName(e.name)
    if (t) {
      template = t
      continue
    }
    const p = parsePubSidecarName(e.name)
    if (p) pub = p
  }
  if (!hash) return null
  return { hash, uses, template, pub }
}

/**
 * Write (or rewrite) all three sidecar kinds for one item. Stale sidecars
 * of any kind that aren't in the new state are removed first, so
 * fragment-references removed from a page's components don't linger as
 * .uses-*.
 */
export async function writeSidecars(storage: StorageProvider, dir: string, state: SidecarState): Promise<void> {
  const want = new Set<string>([sidecarNameFor(state.hash)])
  for (const frag of state.uses) want.add(usesSidecarNameFor(frag))
  if (state.template) want.add(templateSidecarNameFor(state.template))
  if (state.pub) want.add(pubSidecarNameFor(new Date(state.pub.lastPublished), state.pub.noindex))

  // Remove stale sidecars of known kinds that aren't in `want`.
  try {
    const entries = await storage.readDir(dir)
    for (const e of entries) {
      if (want.has(e.name)) continue
      if (
        parseSidecarName(e.name) ||
        parseUsesSidecarName(e.name) ||
        parseTemplateSidecarName(e.name) ||
        parsePubSidecarName(e.name)
      ) {
        try {
          await storage.rm(`${dir}/${e.name}`)
        } catch {
          /* already gone */
        }
      }
    }
  } catch {
    /* dir doesn't exist yet — mkdir below */
  }
  await storage.mkdir(dir)
  // Parallel tiny writes; each is a zero-byte file.
  await Promise.all([...want].map(name => storage.writeFile(`${dir}/${name}`, '')))
}

/**
 * Walk a directory tree collecting every sub-directory's sidecar state.
 * Bounded-parallel recursion — flat Promise.all over 10k dirs would blow
 * the fd limit or provider rate limit.
 *
 * Keys are paths relative to `rootDir` (e.g. `home`, `blog/[slug]`). Items
 * without a .hash sidecar are skipped. `writeSidecars` always writes all
 * three kinds together, so partial state doesn't occur in real operation.
 */
export async function listSidecars(storage: StorageProvider, rootDir: string): Promise<Map<string, SidecarState>> {
  const out = new Map<string, SidecarState>()
  async function walk(dir: string, relative: string): Promise<void> {
    let entries
    try {
      entries = await storage.readDir(dir)
    } catch {
      return
    }
    // Parse sidecar state directly from the entries we already have —
    // avoids a second readDir per directory (readSidecars would re-read
    // the same dir). At 10k pages this halves the I/O calls.
    if (relative) {
      const state = parseSidecarEntries(entries)
      if (state) out.set(relative, state)
    }
    const subdirs = entries.filter(e => e.isDirectory)
    await mapLimit(subdirs, e => walk(`${dir}/${e.name}`, relative ? `${relative}/${e.name}` : e.name))
  }
  await walk(rootDir, '')
  return out
}

/** Parse sidecar state from already-read directory entries. */
function parseSidecarEntries(entries: { name: string; isDirectory: boolean }[]): SidecarState | null {
  let hash: string | null = null
  const uses: string[] = []
  let template: string | null = null
  let pub: PubSidecar | null = null
  for (const e of entries) {
    if (e.isDirectory) continue
    const h = parseSidecarName(e.name)
    if (h) {
      hash = h
      continue
    }
    const u = parseUsesSidecarName(e.name)
    if (u) {
      uses.push(u)
      continue
    }
    const t = parseTemplateSidecarName(e.name)
    if (t) {
      template = t
      continue
    }
    const p = parsePubSidecarName(e.name)
    if (p) pub = p
  }
  if (!hash) return null
  return { hash, uses, template, pub }
}

/**
 * Walk a component tree and collect every @fragment reference, recursing
 * into inline components' children. Used when building SidecarState from
 * a live manifest (source-side).
 */
export function collectFragmentRefs(components: unknown[] | undefined): string[] {
  const refs = new Set<string>()
  function walk(entries: unknown[] | undefined): void {
    if (!Array.isArray(entries)) return
    for (const entry of entries) {
      if (typeof entry === 'string' && entry.startsWith('@')) refs.add(entry.slice(1))
      else if (typeof entry === 'object' && entry !== null) {
        walk((entry as { components?: unknown[] }).components)
      }
    }
  }
  walk(components)
  return [...refs]
}
