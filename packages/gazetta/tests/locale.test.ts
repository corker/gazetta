import { describe, it, expect } from 'vitest'
import {
  normalizeLocale,
  resolveSiteLocales,
  resolveTargetLocales,
  localeFromFilename,
  localeFilename,
  resolveLocaleFallback,
  localeRoutePrefix,
} from '../src/locale.js'
import { resolveSeoTags, type SeoContext } from '../src/seo.js'
import type { SiteManifest, TargetConfig } from '../src/types.js'

describe('normalizeLocale', () => {
  it('lowercases simple codes', () => {
    expect(normalizeLocale('EN')).toBe('en')
    expect(normalizeLocale('Fr')).toBe('fr')
  })

  it('lowercases region codes', () => {
    expect(normalizeLocale('en-GB')).toBe('en-gb')
    expect(normalizeLocale('pt-BR')).toBe('pt-br')
  })

  it('passes through already-lowercase', () => {
    expect(normalizeLocale('fr')).toBe('fr')
  })
})

describe('resolveSiteLocales', () => {
  it('returns null when no locales config', () => {
    expect(resolveSiteLocales({ name: 'test' })).toBeNull()
  })

  it('returns null for empty supported list', () => {
    expect(resolveSiteLocales({ name: 'test', locales: { supported: [] } })).toBeNull()
  })

  it('uses explicit locale as default', () => {
    const result = resolveSiteLocales({ name: 'test', locale: 'fr', locales: { supported: ['en', 'fr'] } })
    expect(result?.default).toBe('fr')
  })

  it('falls back to first in supported when locale not set', () => {
    const result = resolveSiteLocales({ name: 'test', locales: { supported: ['fr', 'en'] } })
    expect(result?.default).toBe('fr')
  })

  it('normalizes locale codes', () => {
    const result = resolveSiteLocales({ name: 'test', locales: { supported: ['en-GB', 'pt-BR'] } })
    expect(result?.supported).toEqual(['en-gb', 'pt-br'])
    expect(result?.default).toBe('en-gb')
  })

  it('defaults for detection and defaultPrefix', () => {
    const result = resolveSiteLocales({ name: 'test', locales: { supported: ['en', 'fr'] } })
    expect(result?.detection).toBe(false)
    expect(result?.defaultPrefix).toBe(false)
  })

  it('respects explicit detection and defaultPrefix', () => {
    const result = resolveSiteLocales({
      name: 'test',
      locales: { supported: ['en', 'fr'], detection: true, defaultPrefix: true },
    })
    expect(result?.detection).toBe(true)
    expect(result?.defaultPrefix).toBe(true)
  })

  it('normalizes fallback keys and values', () => {
    const result = resolveSiteLocales({
      name: 'test',
      locales: { supported: ['en', 'pt', 'pt-BR'], fallbacks: { 'pt-BR': 'pt' } },
    })
    expect(result?.fallbacks).toEqual({ 'pt-br': 'pt' })
  })
})

describe('resolveTargetLocales', () => {
  const site: SiteManifest = { name: 'test', locale: 'en', locales: { supported: ['en', 'fr', 'de'] } }

  it('returns null when site has no i18n', () => {
    expect(resolveTargetLocales({} as TargetConfig, { name: 'test' })).toBeNull()
  })

  it('inherits site locales when target has no override', () => {
    const result = resolveTargetLocales({ storage: { type: 'filesystem' } }, site)
    expect(result?.supported).toEqual(['en', 'fr', 'de'])
    expect(result?.default).toBe('en')
  })

  it('narrows locales with target override', () => {
    const result = resolveTargetLocales({ storage: { type: 'filesystem' }, locales: ['de', 'en'] }, site)
    expect(result?.supported).toEqual(['de', 'en'])
    expect(result?.default).toBe('en')
  })

  it('overrides default locale', () => {
    const result = resolveTargetLocales({ storage: { type: 'filesystem' }, locales: ['de', 'en'], locale: 'de' }, site)
    expect(result?.default).toBe('de')
  })

  it('infers default for single-locale target', () => {
    const result = resolveTargetLocales({ storage: { type: 'filesystem' }, locales: ['fr'] }, site)
    expect(result?.default).toBe('fr')
    expect(result?.detection).toBe(false)
  })

  it('inherits detection from site', () => {
    const siteWithDetection: SiteManifest = {
      name: 'test',
      locales: { supported: ['en', 'fr'], detection: true },
    }
    const result = resolveTargetLocales({ storage: { type: 'filesystem' } }, siteWithDetection)
    expect(result?.detection).toBe(true)
  })

  it('target overrides detection', () => {
    const siteWithDetection: SiteManifest = {
      name: 'test',
      locales: { supported: ['en', 'fr'], detection: true },
    }
    const result = resolveTargetLocales({ storage: { type: 'filesystem' }, detection: false }, siteWithDetection)
    expect(result?.detection).toBe(false)
  })
})

describe('localeFromFilename', () => {
  it('returns null for default locale file', () => {
    expect(localeFromFilename('page.json', 'page')).toBeNull()
    expect(localeFromFilename('fragment.json', 'fragment')).toBeNull()
  })

  it('extracts simple locale', () => {
    expect(localeFromFilename('page.fr.json', 'page')).toBe('fr')
    expect(localeFromFilename('fragment.de.json', 'fragment')).toBe('de')
  })

  it('extracts region locale', () => {
    expect(localeFromFilename('page.en-gb.json', 'page')).toBe('en-gb')
    expect(localeFromFilename('page.pt-br.json', 'page')).toBe('pt-br')
  })

  it('returns null for unrelated files', () => {
    expect(localeFromFilename('index.html', 'page')).toBeNull()
    expect(localeFromFilename('styles.css', 'page')).toBeNull()
  })
})

describe('localeFilename', () => {
  it('returns base.json for null locale', () => {
    expect(localeFilename('page', null)).toBe('page.json')
  })

  it('returns base.locale.json for locale', () => {
    expect(localeFilename('page', 'fr')).toBe('page.fr.json')
    expect(localeFilename('fragment', 'en-gb')).toBe('fragment.en-gb.json')
  })

  it('normalizes locale to lowercase', () => {
    expect(localeFilename('page', 'EN-GB')).toBe('page.en-gb.json')
  })
})

describe('resolveLocaleFallback', () => {
  const resolved = {
    supported: ['en', 'fr', 'pt', 'pt-br'],
    default: 'en',
    defaultPrefix: false,
    detection: false,
    fallbacks: { 'pt-br': 'pt' },
  }

  it('returns the locale if available', () => {
    expect(resolveLocaleFallback('fr', new Set(['en', 'fr']), resolved)).toBe('fr')
  })

  it('walks fallback chain', () => {
    expect(resolveLocaleFallback('pt-br', new Set(['en', 'pt']), resolved)).toBe('pt')
  })

  it('falls back to default when chain exhausted', () => {
    expect(resolveLocaleFallback('de', new Set(['en', 'fr']), resolved)).toBe('en')
  })

  it('normalizes input locale', () => {
    expect(resolveLocaleFallback('FR', new Set(['en', 'fr']), resolved)).toBe('fr')
  })
})

describe('localeRoutePrefix', () => {
  const resolved = {
    supported: ['en', 'fr'],
    default: 'en',
    defaultPrefix: false,
    detection: false,
    fallbacks: {},
  }

  it('returns empty for default locale', () => {
    expect(localeRoutePrefix('en', resolved)).toBe('')
  })

  it('returns /locale for non-default', () => {
    expect(localeRoutePrefix('fr', resolved)).toBe('/fr')
  })

  it('returns /locale for default when defaultPrefix is true', () => {
    const withPrefix = { ...resolved, defaultPrefix: true }
    expect(localeRoutePrefix('en', withPrefix)).toBe('/en')
  })

  it('normalizes locale', () => {
    expect(localeRoutePrefix('FR', resolved)).toBe('/fr')
  })
})

describe('hreflang in resolveSeoTags', () => {
  const baseSeo: SeoContext = { siteUrl: 'https://example.com', locale: 'en' }

  it('emits hreflang tags when alternates have 2+ entries', () => {
    const seo: SeoContext = {
      ...baseSeo,
      hreflangAlternates: { en: 'https://example.com/about', fr: 'https://example.com/fr/about' },
      defaultLocale: 'en',
    }
    const result = resolveSeoTags({ seo, route: '/about' })
    expect(result).toContain('hreflang="en"')
    expect(result).toContain('href="https://example.com/about"')
    expect(result).toContain('hreflang="fr"')
    expect(result).toContain('href="https://example.com/fr/about"')
  })

  it('emits x-default pointing to default locale', () => {
    const seo: SeoContext = {
      ...baseSeo,
      hreflangAlternates: { en: 'https://example.com/about', fr: 'https://example.com/fr/about' },
      defaultLocale: 'en',
    }
    const result = resolveSeoTags({ seo, route: '/about' })
    expect(result).toContain('hreflang="x-default"')
    expect(result).toContain('href="https://example.com/about"')
  })

  it('omits hreflang when only one alternate', () => {
    const seo: SeoContext = {
      ...baseSeo,
      hreflangAlternates: { en: 'https://example.com/about' },
      defaultLocale: 'en',
    }
    const result = resolveSeoTags({ seo, route: '/about' })
    expect(result).not.toContain('hreflang')
  })

  it('omits hreflang when no alternates', () => {
    const result = resolveSeoTags({ seo: baseSeo, route: '/about' })
    expect(result).not.toContain('hreflang')
  })

  it('includes self-referencing alternate', () => {
    const seo: SeoContext = {
      ...baseSeo,
      locale: 'fr',
      hreflangAlternates: { en: 'https://example.com/about', fr: 'https://example.com/fr/about' },
      defaultLocale: 'en',
    }
    const result = resolveSeoTags({ seo, route: '/fr/about' })
    // Both locales present — including the current page's own locale
    expect(result).toContain('hreflang="fr"')
    expect(result).toContain('hreflang="en"')
  })

  it('escapes locale codes in hreflang', () => {
    const seo: SeoContext = {
      ...baseSeo,
      hreflangAlternates: { 'en-gb': 'https://example.com/about', fr: 'https://example.com/fr/about' },
      defaultLocale: 'en-gb',
    }
    const result = resolveSeoTags({ seo, route: '/about' })
    expect(result).toContain('hreflang="en-gb"')
  })
})
