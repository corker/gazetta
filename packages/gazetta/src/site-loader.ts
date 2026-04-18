import { join } from 'node:path'
import type { PageManifest, FragmentManifest, SiteManifest, StorageProvider } from './types.js'
import { parseSiteManifest, parsePageManifest, parseFragmentManifest } from './manifest.js'
import { mapLimit } from './concurrency.js'
import { createContentRoot, type ContentRoot } from './content-root.js'
import { localeFromFilename } from './locale.js'

/** Derive route from page folder name: home → /, about → /about, blog/[slug] → /blog/:slug */
export function deriveRoute(pageName: string): string {
  if (pageName === 'home') return '/'
  return '/' + pageName.replace(/\[([^\]]+)\]/g, ':$1')
}

/** A page or fragment with its locale variants. */
export interface LocalizedEntry<T> {
  /** Default locale manifest (from page.json / fragment.json). */
  default: T
  /** Locale variants keyed by normalized locale code. Empty if single-locale. */
  locales: Map<string, T>
}

export interface Site {
  manifest: SiteManifest
  pages: Map<string, PageManifest & { dir: string }>
  /** Locale variants for pages. Only populated when site has `locales` config. */
  pageLocales: Map<string, LocalizedEntry<PageManifest & { dir: string }>>
  fragments: Map<string, FragmentManifest & { dir: string }>
  /** Locale variants for fragments. Only populated when site has `locales` config. */
  fragmentLocales: Map<string, LocalizedEntry<FragmentManifest & { dir: string }>>
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

interface DiscoverPagesResult {
  pages: Map<string, PageManifest & { dir: string }>
  pageLocales: Map<string, LocalizedEntry<PageManifest & { dir: string }>>
}

async function discoverPages(
  storage: StorageProvider,
  pagesDir: string,
  result: DiscoverPagesResult = { pages: new Map(), pageLocales: new Map() },
  prefix = '',
): Promise<DiscoverPagesResult> {
  if (!(await storage.exists(pagesDir))) {
    if (!prefix) console.warn(`  Warning: pages/ directory not found at ${pagesDir}`)
    return result
  }

  const entries = await storage.readDir(pagesDir)
  const subdirs = entries.filter(e => e.isDirectory)

  // Parallelize manifest reads — sequential is untenable at 10k pages.
  // Bounded concurrency protects the fd table and cloud rate limits.
  await mapLimit(subdirs, async entry => {
    const dir = join(pagesDir, entry.name)
    const name = prefix ? `${prefix}/${entry.name}` : entry.name
    const manifestPath = join(dir, 'page.json')

    if (await storage.exists(manifestPath)) {
      try {
        const manifest = await parsePageManifest(storage, manifestPath)
        const route = deriveRoute(name)
        const pageWithDir = { ...manifest, route, dir }
        result.pages.set(name, pageWithDir)

        // Discover locale variants (page.fr.json, page.en-gb.json, etc.)
        const locales = new Map<string, PageManifest & { dir: string }>()
        const dirEntries = await storage.readDir(dir)
        for (const f of dirEntries) {
          if (f.isDirectory) continue
          const locale = localeFromFilename(f.name, 'page')
          if (!locale) continue
          try {
            const localeManifest = await parsePageManifest(storage, join(dir, f.name))
            const localeRoute = `/${locale}${route === '/' ? '' : route}`
            locales.set(locale, { ...localeManifest, route: localeRoute, dir })
          } catch (err) {
            console.warn(`  Warning: skipping page "${name}" locale "${locale}": ${(err as Error).message}`)
          }
        }
        if (locales.size > 0) {
          result.pageLocales.set(name, { default: pageWithDir, locales })
        }
      } catch (err) {
        console.warn(`  Warning: skipping page "${name}": ${(err as Error).message}`)
      }
    }

    // Recurse into subdirectories to find nested pages (e.g., blog/[slug]).
    await discoverPages(storage, dir, result, name)
  })
  return result
}

interface DiscoverFragmentsResult {
  fragments: Map<string, FragmentManifest & { dir: string }>
  fragmentLocales: Map<string, LocalizedEntry<FragmentManifest & { dir: string }>>
}

async function discoverFragments(storage: StorageProvider, fragmentsDir: string): Promise<DiscoverFragmentsResult> {
  const result: DiscoverFragmentsResult = { fragments: new Map(), fragmentLocales: new Map() }
  if (!(await storage.exists(fragmentsDir))) {
    console.warn(`  Warning: fragments/ directory not found at ${fragmentsDir}`)
    return result
  }

  const entries = await storage.readDir(fragmentsDir)
  const subdirs = entries.filter(e => e.isDirectory)

  await mapLimit(subdirs, async entry => {
    const fragDir = join(fragmentsDir, entry.name)
    const manifestPath = join(fragDir, 'fragment.json')
    if (!(await storage.exists(manifestPath))) return
    try {
      const manifest = await parseFragmentManifest(storage, manifestPath)
      const fragWithDir = { ...manifest, dir: fragDir }
      result.fragments.set(entry.name, fragWithDir)

      // Discover locale variants (fragment.fr.json, etc.)
      const locales = new Map<string, FragmentManifest & { dir: string }>()
      const dirEntries = await storage.readDir(fragDir)
      for (const f of dirEntries) {
        if (f.isDirectory) continue
        const locale = localeFromFilename(f.name, 'fragment')
        if (!locale) continue
        try {
          const localeManifest = await parseFragmentManifest(storage, join(fragDir, f.name))
          locales.set(locale, { ...localeManifest, dir: fragDir })
        } catch (err) {
          console.warn(`  Warning: skipping fragment "${entry.name}" locale "${locale}": ${(err as Error).message}`)
        }
      }
      if (locales.size > 0) {
        result.fragmentLocales.set(entry.name, { default: fragWithDir, locales })
      }
    } catch (err) {
      console.warn(`  Warning: skipping fragment "${entry.name}": ${(err as Error).message}`)
    }
  })
  return result
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
    if (!(await contentRoot.storage.exists(siteYamlPath))) {
      throw new Error(`No site.yaml found at ${siteYamlPath}. Is this a Gazetta site directory?`)
    }
    manifest = await parseSiteManifest(contentRoot.storage, siteYamlPath)
  }
  const { pages, pageLocales } = await discoverPages(contentRoot.storage, contentRoot.path('pages'))
  const { fragments, fragmentLocales } = await discoverFragments(contentRoot.storage, contentRoot.path('fragments'))

  if (pages.size === 0) {
    console.warn(`  Warning: no pages found in ${contentRoot.path('pages')}`)
  }

  return {
    manifest,
    pages,
    pageLocales,
    fragments,
    fragmentLocales,
    contentRoot,
    // backward-compat fields
    siteDir,
    templatesDir,
    storage: contentRoot.storage,
  }
}
