/**
 * Sitemap generation — produces sitemap.xml from target sidecars.
 *
 * SRP: this module owns sitemap XML assembly. It takes the sidecar
 * listing from a target's `pages/` directory (already available via
 * `listSidecars`) and produces the XML string. No I/O — the caller
 * reads sidecars and writes the result to storage.
 *
 * The sitemap reflects what's ACTUALLY published on the target, not
 * what's in the source. A page that exists in source but was never
 * published won't appear. A page that was deleted from source but
 * is still live on the target WILL appear (until the next full
 * publish removes its sidecars).
 *
 * Pages with `.pub-*-noindex` sidecars are excluded. System pages
 * (e.g. 404) are excluded by name.
 */
import type { SidecarState } from './sidecars.js'
import { deriveRoute } from './site-loader.js'

export interface GenerateSitemapOptions {
  /** Absolute base URL (e.g. "https://gazetta.studio"). */
  siteUrl: string
  /** Target sidecar listing — keyed by page name (e.g. "home", "about"). */
  pages: Map<string, SidecarState>
  /** System page names to exclude (e.g. ["404"]). */
  systemPages?: string[]
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Generate sitemap XML from target sidecars. Returns null when no
 * pages qualify (all noindex, or empty target).
 */
export function generateSitemap(opts: GenerateSitemapOptions): string | null {
  const systemSet = new Set(opts.systemPages ?? [])
  const base = opts.siteUrl.replace(/\/+$/, '')
  const urls: string[] = []

  for (const [name, state] of opts.pages) {
    if (systemSet.has(name)) continue
    if (state.pub?.noindex) continue

    const route = deriveRoute(name)
    const loc = `${base}${route}`
    const lastmod = state.pub?.lastPublished

    const parts = [`    <loc>${escapeXml(loc)}</loc>`]
    if (lastmod) {
      // Sitemap spec wants YYYY-MM-DD or full ISO — use date only
      parts.push(`    <lastmod>${lastmod.slice(0, 10)}</lastmod>`)
    }
    urls.push(`  <url>\n${parts.join('\n')}\n  </url>`)
  }

  if (urls.length === 0) return null

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n')
}
