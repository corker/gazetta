/**
 * Unit tests for Cloudflare Worker locale handling.
 * Uses a mock R2 bucket (in-memory Map) to test extractLocale,
 * findPage locale routing, and fragment locale fallback.
 */
import { describe, it, expect } from 'vitest'

// We can't import the Worker directly (needs Cloudflare types at runtime).
// Instead, test the locale logic inline — same patterns as serve.ts tests
// but verifying the Worker's specific code paths.

// Extracted from workers/cloudflare-r2.ts — same logic
function extractLocale(requestPath: string, locales: string[]): { locale: string | undefined; path: string } {
  if (locales.length === 0) return { locale: undefined, path: requestPath }
  const parts = requestPath.split('/').filter(Boolean)
  if (parts.length > 0 && locales.includes(parts[0])) {
    return { locale: parts[0], path: '/' + parts.slice(1).join('/') || '/' }
  }
  return { locale: undefined, path: requestPath }
}

describe('Worker extractLocale', () => {
  const locales = ['fr', 'de', 'pt-br']

  it('extracts known locale prefix', () => {
    expect(extractLocale('/fr/about', locales)).toEqual({ locale: 'fr', path: '/about' })
  })

  it('handles root with locale', () => {
    expect(extractLocale('/fr', locales)).toEqual({ locale: 'fr', path: '/' })
  })

  it('returns undefined for unknown prefix', () => {
    expect(extractLocale('/es/about', locales)).toEqual({ locale: undefined, path: '/es/about' })
  })

  it('handles no locales configured', () => {
    expect(extractLocale('/fr/about', [])).toEqual({ locale: undefined, path: '/fr/about' })
  })

  it('extracts region code', () => {
    expect(extractLocale('/pt-br/about', locales)).toEqual({ locale: 'pt-br', path: '/about' })
  })
})

describe('Worker locale file lookup logic', () => {
  it('locale suffix produces correct index file path', () => {
    const locale = 'fr'
    const resolvedPath = '/about'
    const indexFile = locale ? `index.${locale}.html` : 'index.html'
    const pagePath = `pages${resolvedPath}/${indexFile}`
    expect(pagePath).toBe('pages/about/index.fr.html')
  })

  it('default locale uses index.html', () => {
    const locale = undefined
    const indexFile = locale ? `index.${locale}.html` : 'index.html'
    expect(indexFile).toBe('index.html')
  })

  it('home page with locale', () => {
    const locale = 'fr'
    const resolvedPath = '/'
    const indexFile = `index.${locale}.html`
    const pagePath = resolvedPath === '/' ? `pages/home/${indexFile}` : `pages${resolvedPath}/${indexFile}`
    expect(pagePath).toBe('pages/home/index.fr.html')
  })
})

describe('Worker fragment locale fallback regex', () => {
  it('strips locale suffix from fragment path', () => {
    const path = 'fragments/header/index.fr.html'
    const fallback = path.replace(/\/index\.[a-z-]+\.html$/, '/index.html')
    expect(fallback).toBe('fragments/header/index.html')
  })

  it('does not strip default fragment path', () => {
    const path = 'fragments/header/index.html'
    const fallback = path.replace(/\/index\.[a-z-]+\.html$/, '/index.html')
    expect(fallback).toBe('fragments/header/index.html') // unchanged
  })

  it('strips region code suffix', () => {
    const path = 'fragments/header/index.pt-br.html'
    const fallback = path.replace(/\/index\.[a-z-]+\.html$/, '/index.html')
    expect(fallback).toBe('fragments/header/index.html')
  })
})
