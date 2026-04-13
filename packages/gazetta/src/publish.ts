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
