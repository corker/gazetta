/**
 * Locale-aware publish helpers — renders locale variants alongside defaults.
 *
 * SRP: this module owns the "render all locales for an item" loop.
 * Consumers (admin API publish, CLI publish) call these instead of
 * duplicating the locale iteration logic.
 *
 * When `targetLocales` is provided, only locales in that set are rendered.
 * This supports per-domain deployment where each target serves a locale subset.
 */

import type { StorageProvider, CacheConfig } from './types.js'
import type { Site } from './site-loader.js'
import type { ContentRoot } from './content-root.js'
import type { SeoContext } from './seo.js'
import { publishPageRendered, publishFragmentRendered } from './publish-rendered.js'
import { hashManifest, type HashManifestOptions } from './hash.js'
import { defaultLocaleFor, localeRoutePrefix, resolveSiteLocales } from './locale.js'

export interface PublishLocaleResult {
  files: number
  removed: number
}

/**
 * Publish a page in all locales — default + locale variants.
 * When `targetLocales` is set, only render locales in that subset.
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
    /** When set, only publish locales in this subset. */
    targetLocales?: string[]
    /** Locale keys to skip (already up-to-date). null = default locale. */
    unchangedLocales?: Set<string | null>
  },
): Promise<PublishLocaleResult> {
  const page = site.pages.get(pageName)
  if (!page) return { files: 0, removed: 0 }

  const localeFilter = opts.targetLocales ? new Set(opts.targetLocales) : null
  const skipLocales = opts.unchangedLocales ?? new Set()
  const defaultLocale = defaultLocaleFor(site.manifest)

  // Build hreflang alternates for subpath targets (2+ locales on same domain).
  // Each locale variant of this page gets a map of all sibling locale URLs.
  const resolvedLocales = resolveSiteLocales(site.manifest)
  let hreflangAlternates: Record<string, string> | undefined
  const localeEntry = site.pageLocales.get(pageName)
  if (opts.seo?.siteUrl && resolvedLocales && localeEntry && localeEntry.locales.size > 0) {
    const activeLocales = localeFilter ? [...localeFilter] : [defaultLocale, ...localeEntry.locales.keys()]
    if (activeLocales.length > 1) {
      hreflangAlternates = {}
      for (const loc of activeLocales) {
        const prefix = localeRoutePrefix(loc, resolvedLocales)
        const route = page.route === '/' ? prefix || '/' : `${prefix}${page.route}`
        hreflangAlternates[loc] = `${opts.seo.siteUrl}${route}`
      }
    }
  }

  let totalFiles = 0
  let totalRemoved = 0

  // Default locale — skip if target doesn't include it or already up-to-date
  if ((!localeFilter || localeFilter.has(defaultLocale)) && !skipLocales.has(null)) {
    const manifestHash = hashManifest(page, hashOpts)
    const seoWithHreflang = opts.seo ? { ...opts.seo, hreflangAlternates, defaultLocale } : undefined
    const { files, removed } = await publishPageRendered(
      pageName,
      sourceRoot,
      targetStorage,
      opts.cache,
      opts.templatesDir,
      manifestHash,
      site,
      seoWithHreflang,
    )
    totalFiles += files
    totalRemoved += removed
  }

  // Locale variants — filter by target subset when configured
  if (localeEntry) {
    for (const [locale, localePage] of localeEntry.locales) {
      if (localeFilter && !localeFilter.has(locale)) continue
      if (skipLocales.has(locale)) continue
      const localeHash = hashManifest(localePage, hashOpts)
      const localeSeo = opts.seo ? { ...opts.seo, locale, hreflangAlternates, defaultLocale } : undefined
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
 * When `targetLocales` is set, only render locales in that subset.
 */
export async function publishFragmentAllLocales(
  fragName: string,
  sourceRoot: ContentRoot,
  targetStorage: StorageProvider,
  site: Site,
  hashOpts: HashManifestOptions,
  opts: {
    templatesDir?: string
    /** When set, only publish locales in this subset. */
    targetLocales?: string[]
    /** Locale keys to skip (already up-to-date). null = default locale. */
    unchangedLocales?: Set<string | null>
  },
): Promise<PublishLocaleResult> {
  const frag = site.fragments.get(fragName)
  if (!frag) return { files: 0, removed: 0 }

  const localeFilter = opts.targetLocales ? new Set(opts.targetLocales) : null
  const skipLocales = opts.unchangedLocales ?? new Set()
  const defaultLocale = defaultLocaleFor(site.manifest)

  let totalFiles = 0
  let totalRemoved = 0

  // Default locale — skip if target doesn't include it or already up-to-date
  if ((!localeFilter || localeFilter.has(defaultLocale)) && !skipLocales.has(null)) {
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
  }

  // Locale variants — filter by target subset when configured
  const localeEntry = site.fragmentLocales.get(fragName)
  if (localeEntry) {
    for (const [locale, localeFrag] of localeEntry.locales) {
      if (localeFilter && !localeFilter.has(locale)) continue
      if (skipLocales.has(locale)) continue
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
