import { join } from 'node:path'
import type { StorageProvider } from './types.js'
import type { ContentRoot } from './content-root.js'
import { listSidecars } from './sidecars.js'
import { mapLimit } from './concurrency.js'

// Helper: is the first arg a ContentRoot? Shape-based so imports stay clean.
function isContentRoot(x: unknown): x is ContentRoot {
  return typeof x === 'object' && x !== null
    && 'storage' in x && 'rootPath' in x && 'path' in x
    && typeof (x as { path: unknown }).path === 'function'
}

export interface PublishRequest {
  source: string
  targets: string[]
  items: string[]
}

export interface PublishResult {
  target: string
  success: boolean
  error?: string
  copiedFiles: number
}

/**
 * Copy items from source storage to target storage.
 * Items are relative paths like "pages/home" or "fragments/header".
 * All files under each item directory are copied recursively.
 *
 * Two call shapes:
 *   publishItems(sourceRoot, targetRoot, items)                    // preferred
 *   publishItems(sourceStorage, sourceBase, targetStorage, targetBase, items)  // legacy
 */
export async function publishItems(
  sourceRoot: ContentRoot,
  targetRoot: ContentRoot,
  items: string[]
): Promise<{ copiedFiles: number }>
export async function publishItems(
  sourceStorage: StorageProvider,
  sourceBase: string,
  targetStorage: StorageProvider,
  targetBase: string,
  items: string[]
): Promise<{ copiedFiles: number }>
export async function publishItems(
  sourceOrStorage: ContentRoot | StorageProvider,
  targetOrBase: ContentRoot | string,
  itemsOrTargetStorage: string[] | StorageProvider,
  targetBaseMaybe?: string,
  itemsMaybe?: string[]
): Promise<{ copiedFiles: number }> {
  let sourceStorage: StorageProvider
  let sourceBase: string
  let targetStorage: StorageProvider
  let targetBase: string
  let items: string[]

  if (isContentRoot(sourceOrStorage) && isContentRoot(targetOrBase)) {
    sourceStorage = sourceOrStorage.storage
    sourceBase = sourceOrStorage.rootPath
    targetStorage = targetOrBase.storage
    targetBase = targetOrBase.rootPath
    items = itemsOrTargetStorage as string[]
  } else {
    sourceStorage = sourceOrStorage as StorageProvider
    sourceBase = targetOrBase as string
    targetStorage = itemsOrTargetStorage as StorageProvider
    targetBase = targetBaseMaybe!
    items = itemsMaybe!
  }

  // Copy items in parallel (bounded).
  const counts = await mapLimit(items, async (item) => {
    const sourcePath = join(sourceBase, item)
    const targetPath = join(targetBase, item)
    return copyRecursive(sourceStorage, sourcePath, targetStorage, targetPath)
  })
  let copiedFiles = counts.reduce((a, b) => a + b, 0)

  // Also copy site.yaml
  try {
    const siteYaml = await sourceStorage.readFile(join(sourceBase, 'site.yaml'))
    await targetStorage.writeFile(join(targetBase, 'site.yaml'), siteYaml)
    copiedFiles++
  } catch {
    // site.yaml may not need copying if target already has it
  }

  return { copiedFiles }
}

async function copyRecursive(
  source: StorageProvider,
  sourcePath: string,
  target: StorageProvider,
  targetPath: string
): Promise<number> {
  // Check if sourcePath is a file
  try {
    const content = await source.readFile(sourcePath)
    await target.mkdir(dirname(targetPath))
    await target.writeFile(targetPath, content)
    return 1
  } catch {
    // Not a file — try as directory
  }

  // Try as directory
  if (!await source.exists(sourcePath)) return 0

  const entries = await source.readDir(sourcePath)
  await target.mkdir(targetPath)

  // Bounded-parallel copy of children. Sequential would be O(n) wall time;
  // at 10k files on cloud storage that's minutes of serial I/O latency.
  const counts = await mapLimit(entries, async (entry) => {
    const childSource = join(sourcePath, entry.name)
    const childTarget = join(targetPath, entry.name)
    if (entry.isDirectory) {
      return copyRecursive(source, childSource, target, childTarget)
    }
    const content = await source.readFile(childSource)
    await target.writeFile(childTarget, content)
    return 1
  })

  return counts.reduce((a, b) => a + b, 0)
}

function dirname(path: string): string {
  const parts = path.split('/')
  parts.pop()
  return parts.join('/')
}

/**
 * Resolve dependencies for published items.
 * Given a list of items (pages/fragments), find all referenced templates and fragments.
 *
 * Two call shapes:
 *   resolveDependencies(sourceRoot, items)                 // preferred
 *   resolveDependencies(storage, siteBase, items)           // legacy
 */
export async function resolveDependencies(sourceRoot: ContentRoot, items: string[]): Promise<string[]>
export async function resolveDependencies(storage: StorageProvider, siteBase: string, items: string[]): Promise<string[]>
export async function resolveDependencies(
  sourceOrStorage: ContentRoot | StorageProvider,
  siteBaseOrItems: string | string[],
  itemsMaybe?: string[],
): Promise<string[]> {
  let storage: StorageProvider
  let siteBase: string
  let items: string[]
  if (isContentRoot(sourceOrStorage)) {
    storage = sourceOrStorage.storage
    siteBase = sourceOrStorage.rootPath
    items = siteBaseOrItems as string[]
  } else {
    storage = sourceOrStorage
    siteBase = siteBaseOrItems as string
    items = itemsMaybe!
  }

  const allItems = new Set(items)
  const visited = new Set<string>()

  for (const item of items) {
    await collectDependencies(storage, siteBase, item, allItems, visited)
  }

  return [...allItems]
}

async function collectDependencies(
  storage: StorageProvider,
  siteBase: string,
  item: string,
  allItems: Set<string>,
  visited: Set<string>
): Promise<void> {
  if (visited.has(item)) return
  visited.add(item)

  const manifestNames = ['page.json', 'fragment.json']
  let manifest: Record<string, unknown> | null = null
  const itemPath = join(siteBase, item)

  for (const name of manifestNames) {
    try {
      manifest = JSON.parse(await storage.readFile(join(itemPath, name)))
      break
    } catch { continue }
  }

  if (!manifest) return

  if (typeof manifest.template === 'string') {
    allItems.add(`templates/${manifest.template}`)
  }

  if (Array.isArray(manifest.components)) {
    await collectComponentDeps(manifest.components, storage, siteBase, allItems, visited)
  }
}

async function collectComponentDeps(
  components: unknown[],
  storage: StorageProvider,
  siteBase: string,
  allItems: Set<string>,
  visited: Set<string>
): Promise<void> {
  for (const entry of components) {
    if (typeof entry === 'string' && entry.startsWith('@')) {
      const fragName = entry.slice(1)
      allItems.add(`fragments/${fragName}`)
      await collectDependencies(storage, siteBase, `fragments/${fragName}`, allItems, visited)
    } else if (typeof entry === 'object' && entry !== null) {
      const comp = entry as Record<string, unknown>
      if (typeof comp.template === 'string') {
        allItems.add(`templates/${comp.template}`)
      }
      if (Array.isArray(comp.components)) {
        await collectComponentDeps(comp.components, storage, siteBase, allItems, visited)
      }
    }
  }
}

/**
 * Reverse-dependency lookup: given a fragment name, return the pages and
 * fragments that reference it (transitively). Used by the admin UI to show
 * "publishing @header affects: home, about, blog".
 *
 * On static targets, those pages need to be republished too — fragments are
 * baked into pages at publish time. On ESI targets, republishing the fragment
 * alone suffices because the edge composer resolves @fragments per request.
 */
export async function findFragmentDependents(sourceRoot: ContentRoot, fragmentName: string): Promise<{ pages: string[]; fragments: string[] }>
export async function findFragmentDependents(storage: StorageProvider, siteBase: string, fragmentName: string): Promise<{ pages: string[]; fragments: string[] }>
export async function findFragmentDependents(
  sourceOrStorage: ContentRoot | StorageProvider,
  siteBaseOrFragmentName: string,
  fragmentNameMaybe?: string,
): Promise<{ pages: string[]; fragments: string[] }> {
  let storage: StorageProvider
  let siteBase: string
  let fragmentName: string
  if (isContentRoot(sourceOrStorage)) {
    storage = sourceOrStorage.storage
    siteBase = sourceOrStorage.rootPath
    fragmentName = siteBaseOrFragmentName
  } else {
    storage = sourceOrStorage
    siteBase = siteBaseOrFragmentName
    fragmentName = fragmentNameMaybe!
  }
  return findFragmentDependentsImpl(storage, siteBase, fragmentName)
}

async function findFragmentDependentsImpl(
  storage: StorageProvider,
  siteBase: string,
  fragmentName: string,
): Promise<{ pages: string[]; fragments: string[] }> {
  const pages = new Set<string>()
  const fragments = new Set<string>()

  // Build an index of every manifest → direct @ references
  const manifestsToScan: { kind: 'page' | 'fragment'; name: string }[] = []
  for (const kind of ['pages', 'fragments'] as const) {
    try {
      const entries = await storage.readDir(join(siteBase, kind))
      for (const e of entries) {
        if (e.isDirectory) manifestsToScan.push({ kind: kind === 'pages' ? 'page' : 'fragment', name: e.name })
      }
    } catch { /* missing dir */ }
  }

  function walkComponents(components: unknown[] | undefined, out: string[]) {
    if (!Array.isArray(components)) return
    for (const entry of components) {
      if (typeof entry === 'string' && entry.startsWith('@')) out.push(entry.slice(1))
      else if (typeof entry === 'object' && entry !== null) {
        walkComponents((entry as { components?: unknown[] }).components, out)
      }
    }
  }

  // Read every manifest in parallel (bounded) and index refs in memory.
  // Past this point the BFS is a map lookup, not storage I/O — so it stays
  // fast even at 10k items.
  const directRefs = new Map<string, string[]>()
  await mapLimit(manifestsToScan, async (item) => {
    const refs: string[] = []
    const manifestName = item.kind === 'page' ? 'page.json' : 'fragment.json'
    const dir = item.kind === 'page' ? 'pages' : 'fragments'
    try {
      const raw = await storage.readFile(join(siteBase, dir, item.name, manifestName))
      const manifest = JSON.parse(raw) as { components?: unknown[] }
      walkComponents(manifest.components, refs)
    } catch { /* skip unreadable */ }
    directRefs.set(`${item.kind}:${item.name}`, refs)
  })

  // BFS: find everything that transitively references `fragmentName`.
  const queue = [fragmentName]
  const seen = new Set<string>([fragmentName])
  while (queue.length) {
    const current = queue.shift()!
    for (const item of manifestsToScan) {
      const key = `${item.kind}:${item.name}`
      if (seen.has(key)) continue
      const refs = directRefs.get(key) ?? []
      if (refs.includes(current)) {
        seen.add(key)
        if (item.kind === 'page') pages.add(item.name)
        else { fragments.add(item.name); queue.push(item.name) }
      }
    }
  }

  return { pages: [...pages].sort(), fragments: [...fragments].sort() }
}

/**
 * Fast path for finding dependents against a *published* target.
 *
 * Uses `.uses-{fragment}` and `.tpl-{template}` sidecar filenames (written by
 * writeSidecar in publish-rendered.ts). Needs listings only — no content
 * reads, no JSON parsing. Scales to 10k pages at the cost of one LIST call
 * per item directory.
 *
 * Handles transitive fragment→fragment dependencies: if @inner is referenced
 * by @outer which is referenced by pages/home, querying "@inner" returns
 * home and @outer.
 *
 * Works against target storage (rooted at target base) or source storage
 * (pass `baseDir: siteDir` so the walker descends into `siteDir/pages`).
 */
export async function findDependentsFromSidecars(
  storage: StorageProvider,
  query: { fragment: string } | { template: string },
  opts: { baseDir?: string } = {},
): Promise<{ pages: string[]; fragments: string[] }> {
  const pagesRoot = opts.baseDir ? `${opts.baseDir}/pages` : 'pages'
  const fragmentsRoot = opts.baseDir ? `${opts.baseDir}/fragments` : 'fragments'
  // Single listing pass per root, then all reasoning is in-memory.
  const [pagesList, fragmentsList] = await Promise.all([
    listSidecars(storage, pagesRoot),
    listSidecars(storage, fragmentsRoot),
  ])
  const pagesIndex = new Map<string, { uses: Set<string>; template: string | null }>()
  for (const [name, state] of pagesList) {
    pagesIndex.set(name, { uses: new Set(state.uses), template: state.template })
  }
  const fragmentsIndex = new Map<string, { uses: Set<string>; template: string | null }>()
  for (const [name, state] of fragmentsList) {
    fragmentsIndex.set(name, { uses: new Set(state.uses), template: state.template })
  }

  // Now walk the indexes in-memory. No more storage calls from this point.
  const pages = new Set<string>()
  const fragments = new Set<string>()

  if ('template' in query) {
    for (const [name, info] of pagesIndex) if (info.template === query.template) pages.add(name)
    for (const [name, info] of fragmentsIndex) if (info.template === query.template) fragments.add(name)
    return { pages: [...pages].sort(), fragments: [...fragments].sort() }
  }

  // Fragment query with transitive walk
  const queue = [query.fragment]
  const seen = new Set<string>([query.fragment])
  while (queue.length) {
    const current = queue.shift()!
    for (const [name, info] of pagesIndex) {
      if (info.uses.has(current)) pages.add(name)
    }
    for (const [name, info] of fragmentsIndex) {
      if (info.uses.has(current) && !seen.has(name)) {
        seen.add(name); fragments.add(name); queue.push(name)
      }
    }
  }
  return { pages: [...pages].sort(), fragments: [...fragments].sort() }
}
