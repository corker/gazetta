import type { RenderOutput, ResolvedComponent, PageMetadata, SiteManifest } from './types.js'
import { hashPath, scopeHtml, scopeCss } from './scope.js'

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

/** Context for the fallback chain — site-level defaults that pages inherit. */
export interface SeoContext {
  /** Site name — appended to auto-generated titles ("Page — Site Name"). */
  siteName?: string
  /** Base URL for canonical/og:url generation (e.g. "https://gazetta.studio"). */
  baseUrl?: string
  /** Site locale for `<html lang>` (e.g. "en", "fr"). Default: "en". */
  locale?: string
  /** Default OG image for pages that don't specify their own. */
  defaultOgImage?: string
}

/** Build SeoContext from a SiteManifest. */
export function seoContextFromManifest(manifest: SiteManifest | undefined): SeoContext {
  return {
    siteName: manifest?.name,
    baseUrl: manifest?.baseUrl,
    locale: manifest?.locale,
    defaultOgImage: manifest?.defaultOgImage,
  }
}

/**
 * Resolve all SEO tags for a page using the fallback chain:
 *   metadata field → content field → site default → omit
 *
 * Returns raw HTML for injection into <head>. Template-provided head
 * tags are checked for duplicates — metadata tags are only emitted
 * when the template doesn't already include them.
 */
function metadataHead(
  meta: PageMetadata | undefined,
  content: Record<string, unknown> | undefined,
  route: string | undefined,
  seo: SeoContext,
  templateHead: string | undefined,
): string {
  const parts: string[] = []

  // Title: metadata.title → content.title + " — " + siteName → omit
  const title =
    meta?.title || (content?.title ? `${content.title}${seo.siteName ? ` — ${seo.siteName}` : ''}` : undefined)
  if (title && !templateHead?.includes('<title')) {
    parts.push(`<title>${escapeAttr(title)}</title>`)
  }

  // Description: metadata.description → content.description → omit
  const description = meta?.description || (content?.description as string | undefined)
  if (description && !templateHead?.includes('name="description"')) {
    parts.push(`<meta name="description" content="${escapeAttr(description)}">`)
  }

  // Canonical: metadata.canonical → baseUrl + route → omit
  const canonical = meta?.canonical || (seo.baseUrl && route ? `${seo.baseUrl}${route}` : undefined)
  if (canonical) {
    parts.push(`<link rel="canonical" href="${escapeAttr(canonical)}">`)
  }

  // OG image: metadata.ogImage → site.defaultOgImage → omit
  const ogImage = meta?.ogImage || seo.defaultOgImage
  if (ogImage) {
    parts.push(`<meta property="og:image" content="${escapeAttr(ogImage)}">`)
  }

  // OG title: same chain as <title>
  if (title && !templateHead?.includes('property="og:title"')) {
    parts.push(`<meta property="og:title" content="${escapeAttr(title)}">`)
  }

  // OG description: same chain as description
  if (description && !templateHead?.includes('property="og:description"')) {
    parts.push(`<meta property="og:description" content="${escapeAttr(description)}">`)
  }

  // OG URL: same as canonical
  if (canonical && !templateHead?.includes('property="og:url"')) {
    parts.push(`<meta property="og:url" content="${escapeAttr(canonical)}">`)
  }

  // OG type: always "website"
  if (!templateHead?.includes('property="og:type"')) {
    parts.push('<meta property="og:type" content="website">')
  }

  // Twitter card: summary_large_image when OG image present, summary otherwise
  if (!templateHead?.includes('name="twitter:card"')) {
    parts.push(`<meta name="twitter:card" content="${ogImage ? 'summary_large_image' : 'summary'}">`)
  }

  // Robots: only when explicitly set (absence = allow indexing)
  if (meta?.robots) {
    parts.push(`<meta name="robots" content="${escapeAttr(meta.robots)}">`)
  }

  return parts.join('\n  ')
}

export async function renderComponent(
  component: ResolvedComponent,
  routeParams?: Record<string, string>,
): Promise<RenderOutput> {
  const children = await Promise.all(component.children.map(c => renderComponent(c, routeParams)))
  const output = await component.template({ content: component.content, children, params: routeParams })

  const scopeId = hashPath(component.treePath ?? '')

  const headParts = [...children.map(c => c.head).filter(Boolean), output.head].filter(Boolean)

  return {
    html: scopeHtml(output.html, scopeId),
    css: scopeCss(output.css, scopeId),
    js: output.js,
    head: headParts.length ? headParts.join('\n') : undefined,
  }
}

export async function renderFragment(component: ResolvedComponent): Promise<string> {
  const children = await Promise.all(component.children.map(c => renderComponent(c)))
  const output = await component.template({ content: component.content, children })

  const headContent = [...children.map(c => c.head).filter(Boolean), output.head].filter(Boolean).join('\n  ')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${headContent}
  <style>${output.css}</style>
</head>
<body>
${output.html}${output.js ? `\n<script type="module">${output.js}</script>` : ''}
</body>
</html>`
}

export interface RenderPageOptions {
  routeParams?: Record<string, string>
  metadata?: PageMetadata
  /** Page route (e.g. "/about") — used for canonical URL fallback. */
  route?: string
  /** Site-level SEO context for fallback chains. */
  seo?: SeoContext
}

export async function renderPage(
  component: ResolvedComponent,
  optsOrParams?: RenderPageOptions | Record<string, string>,
): Promise<string> {
  const opts: RenderPageOptions =
    optsOrParams &&
    ('metadata' in optsOrParams || 'routeParams' in optsOrParams || 'seo' in optsOrParams || 'route' in optsOrParams)
      ? (optsOrParams as RenderPageOptions)
      : { routeParams: optsOrParams as Record<string, string> | undefined }
  const seo = opts.seo ?? {}
  const lang = seo.locale || 'en'
  const children = await Promise.all(component.children.map(c => renderComponent(c, opts.routeParams)))
  const output = await component.template({ content: component.content, children, params: opts.routeParams })

  const templateHead = [...children.map(c => c.head).filter(Boolean), output.head].filter(Boolean).join('\n  ')
  const metaHead = metadataHead(opts.metadata, component.content, opts.route, seo, templateHead)
  const headContent = [metaHead, templateHead].filter(Boolean).join('\n  ')

  return `<!DOCTYPE html>
<html lang="${escapeAttr(lang)}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${headContent}
  <style>${output.css}</style>
</head>
<body>
${output.html}${output.js ? `\n<script type="module">${output.js}</script>` : ''}
</body>
</html>`
}
