import type { RenderOutput, ResolvedComponent } from './types.js'
import { generateScopeId, scopeHtml, scopeCss, resetScopeCounter } from './scope.js'

export function renderComponent(component: ResolvedComponent, routeParams?: Record<string, string>): RenderOutput {
  const children = component.children.map(c => renderComponent(c, routeParams))
  const output = component.template({ content: component.content, children, params: routeParams })

  const scopeId = generateScopeId()
  // Collect head from children + this component
  const headParts = [
    ...children.map(c => c.head).filter(Boolean),
    output.head,
  ].filter(Boolean)

  return {
    html: scopeHtml(output.html, scopeId),
    css: scopeCss(output.css, scopeId),
    js: output.js,
    head: headParts.length ? headParts.join('\n') : undefined,
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

  // Collect head tags from: page metadata + page template + all components
  const componentHead = [
    ...children.map(c => c.head).filter(Boolean),
    output.head,
  ].filter(Boolean).join('\n  ')

  const metaHead = [
    description ? `<meta name="description" content="${description}">` : '',
    description ? `<meta property="og:description" content="${description}">` : '',
    title ? `<meta property="og:title" content="${title}">` : '',
  ].filter(Boolean).join('\n  ')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  ${metaHead}
  ${componentHead}
  <style>${output.css}</style>
</head>
<body>
${output.html}${output.js ? `\n<script type="module">${output.js}</script>` : ''}
</body>
</html>`
}
