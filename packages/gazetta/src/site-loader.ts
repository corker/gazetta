import { join } from 'node:path'
import type { PageManifest, FragmentManifest, SiteManifest, StorageProvider } from './types.js'
import { parseSiteManifest, parsePageManifest, parseFragmentManifest } from './manifest.js'

/** Derive route from page folder name: home → /, about → /about, blog/[slug] → /blog/:slug */
export function deriveRoute(pageName: string): string {
  if (pageName === 'home') return '/'
  return '/' + pageName.replace(/\[([^\]]+)\]/g, ':$1')
}

export interface Site {
  manifest: SiteManifest
  pages: Map<string, PageManifest & { dir: string }>
  fragments: Map<string, FragmentManifest & { dir: string }>
  siteDir: string
  /** Directory containing template packages. Defaults to siteDir/templates for flat projects. */
  templatesDir: string
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
  for (const entry of entries) {
    if (!entry.isDirectory) continue
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

    // Recurse into subdirectories to find nested pages (e.g., blog/[slug])
    await discoverPages(storage, dir, pages, name)
  }
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
  for (const entry of entries) {
    if (!entry.isDirectory) continue
    const fragDir = join(fragmentsDir, entry.name)
    const manifestPath = join(fragDir, 'fragment.json')

    if (!await storage.exists(manifestPath)) continue

    try {
      const manifest = await parseFragmentManifest(storage, manifestPath)
      fragments.set(entry.name, { ...manifest, dir: fragDir })
    } catch (err) {
      console.warn(`  Warning: skipping fragment "${entry.name}": ${(err as Error).message}`)
    }
  }
  return fragments
}

export interface LoadSiteOptions {
  siteDir: string
  storage: StorageProvider
  /** Override templates directory (default: siteDir/templates) */
  templatesDir?: string
}

export async function loadSite(siteDirOrOpts: string | LoadSiteOptions, storage?: StorageProvider): Promise<Site> {
  const opts = typeof siteDirOrOpts === 'string'
    ? { siteDir: siteDirOrOpts, storage: storage! }
    : siteDirOrOpts
  const { siteDir } = opts
  const templatesDir = opts.templatesDir ?? join(siteDir, 'templates')

  const siteYaml = join(siteDir, 'site.yaml')
  if (!await opts.storage.exists(siteYaml)) {
    throw new Error(`No site.yaml found at ${siteDir}. Is this a Gazetta site directory?`)
  }
  const manifest = await parseSiteManifest(opts.storage, siteYaml)
  const pages = await discoverPages(opts.storage, join(siteDir, 'pages'))
  const fragments = await discoverFragments(opts.storage, join(siteDir, 'fragments'))

  if (pages.size === 0) {
    console.warn(`  Warning: no pages found in ${join(siteDir, 'pages')}`)
  }

  return { manifest, pages, fragments, siteDir, templatesDir, storage: opts.storage }
}
