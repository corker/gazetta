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
  /** Content root — `{storage, rootPath}` pair for accessing site content. */
  contentRoot: ContentRoot
  /**
   * Storage provider for site content. Equivalent to `contentRoot.storage` —
   * kept as a convenience because resolver and template loading use it directly.
   */
  storage: StorageProvider
  /**
   * Rooting prefix for content under `storage`. Equivalent to `contentRoot.rootPath`.
   * Empty string when storage is target-rooted.
   */
  siteDir: string
  /** Directory containing template packages. Project-level, separate from content rooting. */
  templatesDir: string
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
  /**
   * Pre-parsed site manifest. If provided, site.yaml is not read from the
   * content root. Used when site.yaml is a project-level bootstrap file
   * that lives outside target storage.
   */
  manifest?: SiteManifest
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
 */
export async function loadSite(opts: LoadSiteOptions): Promise<Site> {
  let contentRoot: ContentRoot
  let siteDir: string
  let templatesDir: string

  if (opts.contentRoot) {
    // Preferred: caller built the ContentRoot
    contentRoot = opts.contentRoot
    siteDir = contentRoot.rootPath
    templatesDir = opts.templatesDir ?? join(siteDir, 'templates')
  } else {
    // Legacy options bag: { siteDir, storage, templatesDir? }
    if (!opts.siteDir || !opts.storage) {
      throw new Error('loadSite: either contentRoot, or both siteDir and storage, must be provided')
    }
    siteDir = opts.siteDir
    contentRoot = createContentRoot(opts.storage, siteDir)
    templatesDir = opts.templatesDir ?? join(siteDir, 'templates')
  }

  let manifest: SiteManifest
  if (opts.manifest) {
    // Project-level bootstrap passed in the manifest — skip the storage read.
    manifest = opts.manifest
  } else {
    const siteYamlPath = contentRoot.path('site.yaml')
    if (!await contentRoot.storage.exists(siteYamlPath)) {
      throw new Error(`No site.yaml found at ${siteYamlPath}. Is this a Gazetta site directory?`)
    }
    manifest = await parseSiteManifest(contentRoot.storage, siteYamlPath)
  }
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
