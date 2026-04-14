import { join } from 'node:path'
import type { StorageProvider } from './types.js'

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
 */
export async function publishItems(
  sourceStorage: StorageProvider,
  sourceBase: string,
  targetStorage: StorageProvider,
  targetBase: string,
  items: string[]
): Promise<{ copiedFiles: number }> {
  let copiedFiles = 0

  for (const item of items) {
    const sourcePath = join(sourceBase, item)
    const targetPath = join(targetBase, item)
    copiedFiles += await copyRecursive(sourceStorage, sourcePath, targetStorage, targetPath)
  }

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
  let count = 0

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

  for (const entry of entries) {
    const childSource = join(sourcePath, entry.name)
    const childTarget = join(targetPath, entry.name)
    if (entry.isDirectory) {
      count += await copyRecursive(source, childSource, target, childTarget)
    } else {
      const content = await source.readFile(childSource)
      await target.writeFile(childTarget, content)
      count++
    }
  }

  return count
}

function dirname(path: string): string {
  const parts = path.split('/')
  parts.pop()
  return parts.join('/')
}

/**
 * Resolve dependencies for published items.
 * Given a list of items (pages/fragments), find all referenced templates and fragments.
 */
export async function resolveDependencies(
  storage: StorageProvider,
  siteBase: string,
  items: string[]
): Promise<string[]> {
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
export async function findFragmentDependents(
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

  const directRefs = new Map<string, string[]>() // itemKey -> list of referenced fragment names

  async function loadDirectRefs(kind: 'page' | 'fragment', name: string): Promise<string[]> {
    const key = `${kind}:${name}`
    if (directRefs.has(key)) return directRefs.get(key)!
    const refs: string[] = []
    const manifestName = kind === 'page' ? 'page.json' : 'fragment.json'
    try {
      const raw = await storage.readFile(join(siteBase, kind === 'page' ? 'pages' : 'fragments', name, manifestName))
      const manifest = JSON.parse(raw) as { components?: unknown[] }
      walkComponents(manifest.components, refs)
    } catch { /* skip unreadable manifests */ }
    directRefs.set(key, refs)
    return refs
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

  // BFS: find everything that transitively references `fragmentName`
  const target = fragmentName
  const queue = [target]
  const seen = new Set<string>([target])
  while (queue.length) {
    const current = queue.shift()!
    for (const item of manifestsToScan) {
      const key = `${item.kind}:${item.name}`
      if (seen.has(key)) continue
      const refs = await loadDirectRefs(item.kind, item.name)
      if (refs.includes(current)) {
        seen.add(key)
        if (item.kind === 'page') pages.add(item.name)
        else { fragments.add(item.name); queue.push(item.name) }
      }
    }
  }

  return { pages: [...pages].sort(), fragments: [...fragments].sort() }
}
