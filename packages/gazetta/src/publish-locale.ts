/**
 * Locale-aware publish helpers — renders locale variants alongside defaults.
 *
 * SRP: this module owns the "render all locales for an item" loop.
 * Consumers (admin API publish, CLI publish) call these instead of
 * duplicating the locale iteration logic.
 */

import type { StorageProvider, CacheConfig } from './types.js'
import type { Site } from './site-loader.js'
import type { ContentRoot } from './content-root.js'
import type { SeoContext } from './seo.js'
import { publishPageRendered, publishFragmentRendered } from './publish-rendered.js'
import { hashManifest, type HashManifestOptions } from './hash.js'

export interface PublishLocaleResult {
  files: number
  removed: number
}

/**
 * Publish a page in all locales — default + locale variants.
 * Returns the total file count across all locale renders.
 */
export async function publishPageAllLocales(
  pageName: string,
  sourceRoot: ContentRoot,
  targetStorage: StorageProvider,
  site: Site,
  hashOpts: HashManifestOptions,
  opts: {
    cache?: CacheConfig
    templatesDir?: string
    seo?: SeoContext
  },
): Promise<PublishLocaleResult> {
  const page = site.pages.get(pageName)
  if (!page) return { files: 0, removed: 0 }

  let totalFiles = 0
  let totalRemoved = 0

  // Default locale
  const manifestHash = hashManifest(page, hashOpts)
  const { files, removed } = await publishPageRendered(
    pageName,
    sourceRoot,
    targetStorage,
    opts.cache,
    opts.templatesDir,
    manifestHash,
    site,
    opts.seo,
  )
  totalFiles += files
  totalRemoved += removed

  // Locale variants
  const localeEntry = site.pageLocales.get(pageName)
  if (localeEntry) {
    for (const [locale, localePage] of localeEntry.locales) {
      const localeHash = hashManifest(localePage, hashOpts)
      const localeSeo = opts.seo ? { ...opts.seo, locale } : undefined
      const { files: lf, removed: lr } = await publishPageRendered(
        pageName,
        sourceRoot,
        targetStorage,
        opts.cache,
        opts.templatesDir,
        localeHash,
        site,
        localeSeo,
        locale,
      )
      totalFiles += lf
      totalRemoved += lr
    }
  }

  return { files: totalFiles, removed: totalRemoved }
}

/**
 * Publish a fragment in all locales — default + locale variants.
 */
export async function publishFragmentAllLocales(
  fragName: string,
  sourceRoot: ContentRoot,
  targetStorage: StorageProvider,
  site: Site,
  hashOpts: HashManifestOptions,
  opts: {
    templatesDir?: string
  },
): Promise<PublishLocaleResult> {
  const frag = site.fragments.get(fragName)
  if (!frag) return { files: 0, removed: 0 }

  let totalFiles = 0
  let totalRemoved = 0

  // Default locale
  const manifestHash = hashManifest(frag, hashOpts)
  const { files, removed } = await publishFragmentRendered(
    fragName,
    sourceRoot,
    targetStorage,
    opts.templatesDir,
    manifestHash,
    site,
  )
  totalFiles += files
  totalRemoved += removed

  // Locale variants
  const localeEntry = site.fragmentLocales.get(fragName)
  if (localeEntry) {
    for (const [locale, localeFrag] of localeEntry.locales) {
      const localeHash = hashManifest(localeFrag, hashOpts)
      const { files: lf, removed: lr } = await publishFragmentRendered(
        fragName,
        sourceRoot,
        targetStorage,
        opts.templatesDir,
        localeHash,
        site,
        locale,
      )
      totalFiles += lf
      totalRemoved += lr
    }
  }

  return { files: totalFiles, removed: totalRemoved }
}
