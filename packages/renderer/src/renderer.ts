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

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>${description ? `\n  <meta name="description" content="${description}">` : ''}
  <style>${output.css}</style>
</head>
<body>
${output.html}${output.js ? `\n<script type="module">${output.js}</script>` : ''}
</body>
</html>`
}
