import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { PageManifest, FragmentManifest, SiteManifest } from '@gazetta/shared'
import { parseSiteManifest, parsePageManifest, parseFragmentManifest, fileExists } from './manifest.js'

export interface Site {
  manifest: SiteManifest
  pages: Map<string, PageManifest & { dir: string }>
  fragments: Map<string, FragmentManifest & { dir: string }>
  siteDir: string
}

async function dirExists(path: string): Promise<boolean> {
  try {
    await readdir(path)
    return true
  } catch {
    return false
  }
}

async function discoverPages(
  pagesDir: string,
  pages: Map<string, PageManifest & { dir: string }> = new Map(),
  prefix = ''
): Promise<Map<string, PageManifest & { dir: string }>> {
  if (!await dirExists(pagesDir)) {
    if (!prefix) console.warn(`  Warning: pages/ directory not found at ${pagesDir}`)
    return pages
  }

  const entries = await readdir(pagesDir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dir = join(pagesDir, entry.name)
    const name = prefix ? `${prefix}/${entry.name}` : entry.name
    const manifestPath = join(dir, 'page.yaml')

    if (await fileExists(manifestPath)) {
      try {
        const manifest = await parsePageManifest(manifestPath)
        pages.set(name, { ...manifest, dir })
      } catch (err) {
        console.warn(`  Warning: skipping page "${name}": ${(err as Error).message}`)
      }
    }

    // Recurse into subdirectories to find nested pages (e.g., blog/[slug])
    await discoverPages(dir, pages, name)
  }
  return pages
}

async function discoverFragments(fragmentsDir: string): Promise<Map<string, FragmentManifest & { dir: string }>> {
  const fragments = new Map<string, FragmentManifest & { dir: string }>()
  if (!await dirExists(fragmentsDir)) {
    console.warn(`  Warning: fragments/ directory not found at ${fragmentsDir}`)
    return fragments
  }

  const entries = await readdir(fragmentsDir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const fragDir = join(fragmentsDir, entry.name)
    const manifestPath = join(fragDir, 'fragment.yaml')

    if (!await fileExists(manifestPath)) continue

    try {
      const manifest = await parseFragmentManifest(manifestPath)
      fragments.set(entry.name, { ...manifest, dir: fragDir })
    } catch (err) {
      console.warn(`  Warning: skipping fragment "${entry.name}": ${(err as Error).message}`)
    }
  }
  return fragments
}

export async function loadSite(siteDir: string): Promise<Site> {
  const siteYaml = join(siteDir, 'site.yaml')
  if (!await fileExists(siteYaml)) {
    throw new Error(`No site.yaml found at ${siteDir}. Is this a Gazetta site directory?`)
  }
  const manifest = await parseSiteManifest(siteYaml)
  const pages = await discoverPages(join(siteDir, 'pages'))
  const fragments = await discoverFragments(join(siteDir, 'fragments'))

  if (pages.size === 0) {
    console.warn(`  Warning: no pages found in ${join(siteDir, 'pages')}`)
  }

  return { manifest, pages, fragments, siteDir }
}
