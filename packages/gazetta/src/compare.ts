import { loadSite } from './site-loader.js'
import { hashManifest, parseSidecarName } from './hash.js'
import { scanTemplates, templateHashesFrom } from './templates-scan.js'
import { mapLimit } from './concurrency.js'
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
  const templateInfos = await scanTemplates(opts.templatesDir, opts.projectRoot)
  const invalidTemplates = templateInfos.filter(t => !t.valid)
    .map(t => ({ name: t.name, errors: t.errors }))
  const templateHashes = templateHashesFrom(templateInfos)

  // 2. Load local site, compute manifest hashes
  const site = await loadSite({ siteDir: opts.siteDir, storage: opts.source, templatesDir: opts.templatesDir })
  const local = new Map<string, string>()
  for (const [name, page] of site.pages) {
    local.set(`pages/${name}`, hashManifest(page, { templateHashes }))
  }
  // Static-mode targets bake fragments into pages — no fragment sidecars exist
  // on the target, and publishing @header/@footer is a no-op server-side. Omit
  // them from local so they don't appear as perpetually "added".
  if (opts.publishMode !== 'static') {
    for (const [name, frag] of site.fragments) {
      local.set(`fragments/${name}`, hashManifest(frag, { templateHashes }))
    }
  }

  // 3. List target sidecars
  const target = new Map<string, string>()
  await collectSidecars(opts.target, 'pages', target)
  if (opts.publishMode !== 'static') {
    await collectSidecars(opts.target, 'fragments', target)
  }

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

/**
 * Walk `pages/` or `fragments/` looking for `.{8hex}.hash` sidecar files.
 * Records `pages/home` → `abc12345` for each found.
 *
 * Bounded-parallel recursion — flat Promise.all over 10k dirs would blow
 * the fd limit or provider rate limit.
 */
async function collectSidecars(
  storage: StorageProvider,
  rootDir: string,
  out: Map<string, string>,
  prefix = rootDir
): Promise<void> {
  let entries: Awaited<ReturnType<StorageProvider['readDir']>>
  try {
    entries = await storage.readDir(rootDir)
  } catch {
    return
  }
  let foundSidecar: string | null = null
  for (const e of entries) {
    if (!e.isDirectory) {
      const hash = parseSidecarName(e.name)
      if (hash) foundSidecar = hash
    }
  }
  if (foundSidecar) {
    out.set(prefix, foundSidecar)
  }
  const subdirs = entries.filter(e => e.isDirectory)
  await mapLimit(subdirs, async (e) => {
    await collectSidecars(storage, `${rootDir}/${e.name}`, out, `${prefix}/${e.name}`)
  })
}
