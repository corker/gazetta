import { describe, it, expect } from 'vitest'
import { generateSitemap } from '../src/sitemap.js'
import type { SidecarState } from '../src/sidecars.js'

function page(name: string, lastPublished?: string, noindex = false): [string, SidecarState] {
  return [
    name,
    {
      hash: '00000000',
      uses: [],
      template: null,
      pub: lastPublished ? { lastPublished, noindex } : null,
    },
  ]
}

describe('generateSitemap', () => {
  it('generates XML with loc for each page', () => {
    const pages = new Map([page('home'), page('about'), page('blog/hello')])
    const xml = generateSitemap({ siteUrl: 'https://example.com', pages })!
    expect(xml).toContain('<loc>https://example.com/</loc>')
    expect(xml).toContain('<loc>https://example.com/about</loc>')
    expect(xml).toContain('<loc>https://example.com/blog/hello</loc>')
    expect(xml).toContain('<?xml version="1.0"')
    expect(xml).toContain('<urlset')
  })

  it('includes lastmod from pub sidecar timestamp', () => {
    const pages = new Map([page('about', '2026-04-17T22:00:00Z')])
    const xml = generateSitemap({ siteUrl: 'https://example.com', pages })!
    expect(xml).toContain('<lastmod>2026-04-17</lastmod>')
  })

  it('omits lastmod when pub sidecar has no timestamp', () => {
    const pages = new Map([page('about')])
    const xml = generateSitemap({ siteUrl: 'https://example.com', pages })!
    expect(xml).not.toContain('<lastmod>')
  })

  it('skips pages with noindex pub sidecar', () => {
    const pages = new Map([page('home'), page('secret', '2026-04-17T22:00:00Z', true)])
    const xml = generateSitemap({ siteUrl: 'https://example.com', pages })!
    expect(xml).toContain('<loc>https://example.com/</loc>')
    expect(xml).not.toContain('secret')
  })

  it('skips system pages', () => {
    const pages = new Map([page('home'), page('404')])
    const xml = generateSitemap({ siteUrl: 'https://example.com', pages, systemPages: ['404'] })!
    expect(xml).toContain('<loc>https://example.com/</loc>')
    expect(xml).not.toContain('404')
  })

  it('returns null when no pages qualify', () => {
    const pages = new Map([page('404')])
    expect(generateSitemap({ siteUrl: 'https://example.com', pages, systemPages: ['404'] })).toBeNull()
  })

  it('returns null for empty target', () => {
    expect(generateSitemap({ siteUrl: 'https://example.com', pages: new Map() })).toBeNull()
  })

  it('escapes special characters in URLs', () => {
    const pages = new Map([page('search&filter')])
    const xml = generateSitemap({ siteUrl: 'https://example.com', pages })!
    expect(xml).toContain('search&amp;filter')
  })

  it('skips dynamic route pages (template patterns are not crawlable)', () => {
    const pages = new Map([page('home'), page('blog/[slug]'), page('docs/[...path]')])
    const xml = generateSitemap({ siteUrl: 'https://example.com', pages })!
    expect(xml).toContain('<loc>https://example.com/</loc>')
    expect(xml).not.toContain(':slug')
    expect(xml).not.toContain('[slug]')
    expect(xml).not.toContain('[...path]')
  })
})
