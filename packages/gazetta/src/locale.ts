/**
 * Locale resolution — single source of truth for locale configuration.
 *
 * Resolves the effective locale settings for a site and for each target,
 * applying inheritance (target inherits from site) and inference
 * (single-locale target auto-infers its default).
 *
 * All locale logic goes through this module. Consumers (renderer, publisher,
 * CLI, admin API) call these functions instead of reading raw config fields.
 */

import type { SiteManifest, TargetConfig, LocalesConfig } from './types.js'

/** Resolved locale settings for a site or target. */
export interface ResolvedLocales {
  /** All supported locale codes, normalized to lowercase. */
  supported: string[]
  /** The default locale code. */
  default: string
  /** Whether the default locale gets a URL prefix. */
  defaultPrefix: boolean
  /** Whether Accept-Language detection/redirect is enabled. */
  detection: boolean
  /** Fallback chains. E.g. { 'pt-br': 'pt' }. */
  fallbacks: Record<string, string>
}

/** Normalize a BCP 47 locale code to lowercase for filenames. */
export function normalizeLocale(locale: string): string {
  return locale.toLowerCase()
}

/**
 * Resolve site-level locale settings.
 * Returns null if i18n is not enabled (no `locales` config).
 */
export function resolveSiteLocales(site: SiteManifest): ResolvedLocales | null {
  if (!site.locales) return null
  const supported = site.locales.supported.map(normalizeLocale)
  if (supported.length === 0) return null
  const defaultLocale = normalizeLocale(site.locale ?? supported[0])
  return {
    supported,
    default: defaultLocale,
    defaultPrefix: site.locales.defaultPrefix ?? false,
    detection: site.locales.detection ?? false,
    fallbacks: normalizeFallbacks(site.locales.fallbacks),
  }
}

/**
 * Resolve target-level locale settings, inheriting from site.
 * Returns null if i18n is not enabled at the site level.
 */
export function resolveTargetLocales(target: TargetConfig, site: SiteManifest): ResolvedLocales | null {
  const siteLocales = resolveSiteLocales(site)
  if (!siteLocales) return null

  const supported = target.locales ? target.locales.map(normalizeLocale) : siteLocales.supported

  const defaultLocale = target.locale
    ? normalizeLocale(target.locale)
    : supported.length === 1
      ? supported[0] // single-locale target: the only locale IS the default
      : siteLocales.default

  return {
    supported,
    default: defaultLocale,
    defaultPrefix: target.defaultPrefix ?? siteLocales.defaultPrefix,
    detection:
      supported.length === 1
        ? false // single-locale: nothing to detect
        : (target.detection ?? siteLocales.detection),
    fallbacks: siteLocales.fallbacks,
  }
}

/**
 * Resolve the locale for a given filename suffix.
 * `page.json` → default locale, `page.fr.json` → 'fr'.
 */
export function localeFromFilename(filename: string, baseName: string): string | null {
  // page.json → null (default)
  if (filename === `${baseName}.json`) return null
  // page.fr.json → 'fr', page.en-gb.json → 'en-gb'
  const prefix = `${baseName}.`
  const suffix = '.json'
  if (filename.startsWith(prefix) && filename.endsWith(suffix)) {
    const locale = filename.slice(prefix.length, -suffix.length)
    return locale || null
  }
  return null
}

/**
 * Build the filename for a locale variant.
 * `('page', null)` → `page.json`, `('page', 'fr')` → `page.fr.json`.
 */
export function localeFilename(baseName: string, locale: string | null): string {
  if (!locale) return `${baseName}.json`
  return `${baseName}.${normalizeLocale(locale)}.json`
}

/**
 * Resolve a locale through the fallback chain.
 * Returns the first locale in the chain that has content,
 * or the default if nothing matches.
 *
 * @param locale - The requested locale
 * @param available - Set of locales that have content
 * @param resolved - The resolved locale settings (for fallbacks and default)
 */
export function resolveLocaleFallback(locale: string, available: Set<string>, resolved: ResolvedLocales): string {
  const norm = normalizeLocale(locale)
  if (available.has(norm)) return norm

  // Walk fallback chain
  let current = norm
  while (resolved.fallbacks[current]) {
    current = resolved.fallbacks[current]
    if (available.has(current)) return current
  }

  // Fall back to default
  if (available.has(resolved.default)) return resolved.default

  // Last resort: first available
  for (const loc of available) return loc
  return resolved.default
}

/**
 * Build the route prefix for a locale on a given target.
 * Default locale → '' (no prefix, unless defaultPrefix is true).
 * Other locales → '/{locale}'.
 */
export function localeRoutePrefix(locale: string, resolved: ResolvedLocales): string {
  const norm = normalizeLocale(locale)
  if (norm === resolved.default && !resolved.defaultPrefix) return ''
  return `/${norm}`
}

/** Normalize fallback keys and values to lowercase. */
function normalizeFallbacks(fallbacks?: Record<string, string>): Record<string, string> {
  if (!fallbacks) return {}
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(fallbacks)) {
    result[normalizeLocale(key)] = normalizeLocale(value)
  }
  return result
}
