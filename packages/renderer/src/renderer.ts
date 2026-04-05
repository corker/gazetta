import type { RenderOutput, ResolvedComponent } from '@gazetta/core'
import { generateScopeId, scopeHtml, scopeCss, resetScopeCounter } from './scope.js'

export function renderComponent(component: ResolvedComponent, routeParams?: Record<string, string>): RenderOutput {
  const children = component.children.map(c => renderComponent(c, routeParams))
  const output = component.template({ content: component.content, children, params: routeParams })

  const scopeId = generateScopeId()
  return {
    html: scopeHtml(output.html, scopeId),
    css: scopeCss(output.css, scopeId),
    js: output.js,
  }
}

export function renderPage(
  component: ResolvedComponent,
  metadata?: Record<string, unknown>,
  routeParams?: Record<string, string>
): string {
  resetScopeCounter()
  // Page-level template CSS is not scoped (allows body/html/global styles)
  // Children are still scoped individually
  const children = component.children.map(c => renderComponent(c, routeParams))
  const output = component.template({ content: component.content, children, params: routeParams })
  const title = (metadata?.title as string) ?? 'Gazetta'
  const description = metadata?.description as string | undefined
  const head = metadata?.head as string | undefined
  const favicon = metadata?.favicon as string | undefined
  const ogImage = metadata?.['og:image'] as string | undefined
  const ogTitle = metadata?.['og:title'] as string | undefined

  const headTags = [
    description ? `<meta name="description" content="${description}">` : '',
    ogImage ? `<meta property="og:image" content="${ogImage}">` : '',
    ogTitle ? `<meta property="og:title" content="${ogTitle}">` : title ? `<meta property="og:title" content="${title}">` : '',
    description ? `<meta property="og:description" content="${description}">` : '',
    favicon ? `<link rel="icon" href="${favicon}">` : '',
    head ?? '',
  ].filter(Boolean).join('\n  ')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  ${headTags}
  <style>${output.css}</style>
</head>
<body>
${output.html}${output.js ? `\n<script type="module">${output.js}</script>` : ''}
</body>
</html>`
}
