import { join } from 'node:path'
import type { PageManifest, FragmentManifest, SiteManifest, StorageProvider } from './types.js'
import { parseSiteManifest, parsePageManifest, parseFragmentManifest } from './manifest.js'
import { mapLimit } from './concurrency.js'
import { createContentRoot, type ContentRoot } from './content-root.js'

/** Derive route from page folder name: home → /, about → /about, blog/[slug] → /blog/:slug */
export function deriveRoute(pageName: string): string {
  if (pageName === 'home') return '/'
  return '/' + pageName.replace(/\[([^\]]+)\]/g, ':$1')
}

export interface Site {
  manifest: SiteManifest
  pages: Map<string, PageManifest & { dir: string }>
  fragments: Map<string, FragmentManifest & { dir: string }>
  /**
   * Content root — `{storage, rootPath}` pair for accessing site content.
   * Use this for new code; `siteDir` and `storage` below are retained for
   * backward compatibility with callers that haven't migrated yet.
   */
  contentRoot: ContentRoot
  /** @deprecated Use `contentRoot.rootPath`. Retained for backward compatibility. */
  siteDir: string
  /** Directory containing template packages. Defaults to siteDir/templates for flat projects. */
  templatesDir: string
  /** @deprecated Use `contentRoot.storage`. Retained for backward compatibility. */
  storage: StorageProvider
}

async function discoverPages(
  storage: StorageProvider,
  pagesDir: string,
  pages: Map<string, PageManifest & { dir: string }> = new Map(),
  prefix = ''
): Promise<Map<string, PageManifest & { dir: string }>> {
  if (!await storage.exists(pagesDir)) {
    if (!prefix) console.warn(`  Warning: pages/ directory not found at ${pagesDir}`)
    return pages
  }

  const entries = await storage.readDir(pagesDir)
  const subdirs = entries.filter(e => e.isDirectory)

  // Parallelize manifest reads — sequential is untenable at 10k pages.
  // Bounded concurrency protects the fd table and cloud rate limits.
  await mapLimit(subdirs, async (entry) => {
    const dir = join(pagesDir, entry.name)
    const name = prefix ? `${prefix}/${entry.name}` : entry.name
    const manifestPath = join(dir, 'page.json')

    if (await storage.exists(manifestPath)) {
      try {
        const manifest = await parsePageManifest(storage, manifestPath)
        const route = deriveRoute(name)
        pages.set(name, { ...manifest, route, dir })
      } catch (err) {
        console.warn(`  Warning: skipping page "${name}": ${(err as Error).message}`)
      }
    }

    // Recurse into subdirectories to find nested pages (e.g., blog/[slug]).
    // Recursive call inherits the same bounded mapLimit — workers at each
    // level compete for the same concurrency budget.
    await discoverPages(storage, dir, pages, name)
  })
  return pages
}

async function discoverFragments(
  storage: StorageProvider,
  fragmentsDir: string
): Promise<Map<string, FragmentManifest & { dir: string }>> {
  const fragments = new Map<string, FragmentManifest & { dir: string }>()
  if (!await storage.exists(fragmentsDir)) {
    console.warn(`  Warning: fragments/ directory not found at ${fragmentsDir}`)
    return fragments
  }

  const entries = await storage.readDir(fragmentsDir)
  const subdirs = entries.filter(e => e.isDirectory)

  await mapLimit(subdirs, async (entry) => {
    const fragDir = join(fragmentsDir, entry.name)
    const manifestPath = join(fragDir, 'fragment.json')
    if (!await storage.exists(manifestPath)) return
    try {
      const manifest = await parseFragmentManifest(storage, manifestPath)
      fragments.set(entry.name, { ...manifest, dir: fragDir })
    } catch (err) {
      console.warn(`  Warning: skipping fragment "${entry.name}": ${(err as Error).message}`)
    }
  })
  return fragments
}

export interface LoadSiteOptions {
  /** @deprecated Pass `contentRoot` instead (preferred for new code). */
  siteDir?: string
  /** @deprecated Pass `contentRoot` instead (preferred for new code). */
  storage?: StorageProvider
  /** Content root — where site content lives. Preferred over siteDir/storage. */
  contentRoot?: ContentRoot
  /** Override templates directory (default: siteDir/templates). */
  templatesDir?: string
}

/**
 * Load a site from a storage provider.
 *
 * Two input shapes are supported:
 * - **Preferred**: `{ contentRoot, templatesDir }` — storage rooting is
 *   whatever the caller chose (cwd-rooted with siteDir prefix, or target-
 *   rooted with empty prefix). Callers construct the root once; this
 *   function doesn't care.
 * - **Legacy**: `{ siteDir, storage, templatesDir? }` — the pair is wrapped
 *   in a ContentRoot internally. Retained for callers that haven't
 *   migrated yet.
 *
 * Also accepts the very old `loadSite(siteDir, storage)` positional form.
 */
export async function loadSite(
  siteDirOrOpts: string | LoadSiteOptions,
  storage?: StorageProvider,
): Promise<Site> {
  let contentRoot: ContentRoot
  let siteDir: string
  let templatesDir: string

  if (typeof siteDirOrOpts === 'string') {
    // loadSite(siteDir, storage) — very legacy positional form
    siteDir = siteDirOrOpts
    if (!storage) throw new Error('loadSite: storage is required when the first argument is a siteDir string')
    contentRoot = createContentRoot(storage, siteDir)
    templatesDir = join(siteDir, 'templates')
  } else if (siteDirOrOpts.contentRoot) {
    // Preferred: caller built the ContentRoot
    contentRoot = siteDirOrOpts.contentRoot
    siteDir = contentRoot.rootPath
    templatesDir = siteDirOrOpts.templatesDir ?? join(siteDir, 'templates')
  } else {
    // Legacy options bag: { siteDir, storage, templatesDir? }
    if (!siteDirOrOpts.siteDir || !siteDirOrOpts.storage) {
      throw new Error('loadSite: either contentRoot, or both siteDir and storage, must be provided')
    }
    siteDir = siteDirOrOpts.siteDir
    contentRoot = createContentRoot(siteDirOrOpts.storage, siteDir)
    templatesDir = siteDirOrOpts.templatesDir ?? join(siteDir, 'templates')
  }

  const siteYamlPath = contentRoot.path('site.yaml')
  if (!await contentRoot.storage.exists(siteYamlPath)) {
    throw new Error(`No site.yaml found at ${siteYamlPath}. Is this a Gazetta site directory?`)
  }
  const manifest = await parseSiteManifest(contentRoot.storage, siteYamlPath)
  const pages = await discoverPages(contentRoot.storage, contentRoot.path('pages'))
  const fragments = await discoverFragments(contentRoot.storage, contentRoot.path('fragments'))

  if (pages.size === 0) {
    console.warn(`  Warning: no pages found in ${contentRoot.path('pages')}`)
  }

  return {
    manifest, pages, fragments, contentRoot,
    // backward-compat fields
    siteDir, templatesDir, storage: contentRoot.storage,
  }
}
