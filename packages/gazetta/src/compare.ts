import { join } from 'node:path'
import { loadSite } from './site-loader.js'
import { hashManifest } from './hash.js'
import { scanTemplates, templateHashesFrom, type TemplateInfo } from './templates-scan.js'
import { listSidecars } from './sidecars.js'
import type { StorageProvider } from './types.js'

export interface CompareResult {
  /** Items present locally but not on target (no sidecar found) */
  added: string[]
  /** Items present on both, hashes differ */
  modified: string[]
  /** Items present on target but not locally */
  deleted: string[]
  /** Items present on both with matching hashes */
  unchanged: string[]
  /** Target has no sidecars at all (never published, or pre-sidecar) */
  firstPublish: boolean
  /** Templates that failed to scan — compare still completes, but hashes for affected pages may be off */
  invalidTemplates: { name: string; errors: string[] }[]
}

export interface CompareOptions {
  source: StorageProvider
  target: StorageProvider
  siteDir: string
  templatesDir: string
  projectRoot: string
  /**
   * Target's publish mode. In static mode fragments are baked into pages, so
   * they're not published as separate items — omit them from compare to avoid
   * listing @header / @footer as "added" when they can't actually be published.
   * Defaults to 'esi' (include fragments).
   */
  publishMode?: 'static' | 'esi'
  /**
   * Injectable template scanner. The default reads from disk every call; the
   * admin-api server injects a memoized version invalidated by the template
   * file watcher (5s → 0ms on large projects).
   */
  scanTemplates?: (templatesDir: string, projectRoot: string) => Promise<TemplateInfo[]>
}

/**
 * Compare local source state against a published target.
 *
 * Local: hashes each page/fragment manifest with template hashes substituted in memory.
 * Target: lists `pages/` and `fragments/` recursively, reading sidecar filenames
 * (`.{8hex}.hash`) — no per-file content reads needed.
 *
 * Returns added/modified/deleted/unchanged lists. Items use `pages/{name}` or
 * `fragments/{name}` form so they can be passed back to publish.
 */
export async function compareTargets(opts: CompareOptions): Promise<CompareResult> {
  // 1. Validate + hash templates
  const scan = opts.scanTemplates ?? scanTemplates
  const templateInfos = await scan(opts.templatesDir, opts.projectRoot)
  const invalidTemplates = templateInfos.filter(t => !t.valid)
    .map(t => ({ name: t.name, errors: t.errors }))
  const templateHashes = templateHashesFrom(templateInfos)

  // 2. Load local site, compute manifest hashes.
  // Source-side sidecars (written on save) let us skip re-hashing for items
  // whose manifest + templates haven't changed since the last save. Fall
  // back to hashManifest for items without a source sidecar.
  const site = await loadSite({ siteDir: opts.siteDir, storage: opts.source, templatesDir: opts.templatesDir })
  const [sourcePagesSidecars, sourceFragmentsSidecars] = await Promise.all([
    listSidecars(opts.source, join(opts.siteDir, 'pages')),
    listSidecars(opts.source, join(opts.siteDir, 'fragments')),
  ])
  // Hash fragments first (they don't depend on page hashes). Static-mode
  // page hashes include fragment hashes so a fragment content change
  // invalidates every page that bakes it in.
  const fragmentHashes = new Map<string, string>()
  for (const [name, frag] of site.fragments) {
    const cached = sourceFragmentsSidecars.get(name)?.hash
    fragmentHashes.set(name, cached ?? hashManifest(frag, { templateHashes }))
  }

  const local = new Map<string, string>()
  const pageHashOpts = opts.publishMode === 'static'
    ? { templateHashes, fragmentHashes }
    : { templateHashes }
  for (const [name, page] of site.pages) {
    // Source sidecars are written without fragmentHashes (source doesn't
    // know target's publish mode). For static targets we must re-hash.
    const cached = opts.publishMode === 'static' ? null : sourcePagesSidecars.get(name)?.hash
    local.set(`pages/${name}`, cached ?? hashManifest(page, pageHashOpts))
  }
  // Static-mode targets bake fragments into pages — no fragment sidecars exist
  // on the target, and publishing @header/@footer is a no-op server-side. Omit
  // them from local so they don't appear as perpetually "added".
  if (opts.publishMode !== 'static') {
    for (const [name, hash] of fragmentHashes) {
      local.set(`fragments/${name}`, hash)
    }
  }

  // 3. List target sidecars — one pass per root, parallel inside.
  const target = new Map<string, string>()
  const [pagesSidecars, fragmentsSidecars] = await Promise.all([
    listSidecars(opts.target, 'pages'),
    opts.publishMode !== 'static' ? listSidecars(opts.target, 'fragments') : Promise.resolve(new Map()),
  ])
  for (const [k, s] of pagesSidecars) target.set(`pages/${k}`, s.hash)
  for (const [k, s] of fragmentsSidecars) target.set(`fragments/${k}`, s.hash)

  // 4. Diff
  const result: CompareResult = {
    added: [],
    modified: [],
    deleted: [],
    unchanged: [],
    firstPublish: target.size === 0,
    invalidTemplates,
  }

  for (const [item, hash] of local) {
    const targetHash = target.get(item)
    if (targetHash === undefined) result.added.push(item)
    else if (targetHash === hash) result.unchanged.push(item)
    else result.modified.push(item)
  }
  for (const item of target.keys()) {
    if (!local.has(item)) result.deleted.push(item)
  }

  return result
}

