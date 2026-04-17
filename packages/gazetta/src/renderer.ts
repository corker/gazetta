import type { RenderOutput, ResolvedComponent, PageMetadata } from './types.js'
import { hashPath, scopeHtml, scopeCss } from './scope.js'

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

function metadataHead(meta: PageMetadata | undefined, templateHead: string | undefined): string {
  if (!meta) return ''
  const parts: string[] = []
  if (meta.title && !templateHead?.includes('<title')) {
    parts.push(`<title>${escapeAttr(meta.title)}</title>`)
  }
  if (meta.description && !templateHead?.includes('name="description"')) {
    parts.push(`<meta name="description" content="${escapeAttr(meta.description)}">`)
  }
  if (meta.ogImage) {
    parts.push(`<meta property="og:image" content="${escapeAttr(meta.ogImage)}">`)
  }
  if (meta.canonical) {
    parts.push(`<link rel="canonical" href="${escapeAttr(meta.canonical)}">`)
  }
  if (meta.title && !templateHead?.includes('property="og:title"')) {
    parts.push(`<meta property="og:title" content="${escapeAttr(meta.title)}">`)
  }
  if (meta.description && !templateHead?.includes('property="og:description"')) {
    parts.push(`<meta property="og:description" content="${escapeAttr(meta.description)}">`)
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
}

export async function renderPage(
  component: ResolvedComponent,
  optsOrParams?: RenderPageOptions | Record<string, string>,
): Promise<string> {
  const opts: RenderPageOptions =
    optsOrParams && ('metadata' in optsOrParams || 'routeParams' in optsOrParams)
      ? (optsOrParams as RenderPageOptions)
      : { routeParams: optsOrParams as Record<string, string> | undefined }
  const children = await Promise.all(component.children.map(c => renderComponent(c, opts.routeParams)))
  const output = await component.template({ content: component.content, children, params: opts.routeParams })

  const templateHead = [...children.map(c => c.head).filter(Boolean), output.head].filter(Boolean).join('\n  ')
  const metaHead = metadataHead(opts.metadata, templateHead)
  const headContent = [metaHead, templateHead].filter(Boolean).join('\n  ')

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
