import type { RenderOutput, ResolvedComponent } from './types.js'
import { generateScopeId, scopeHtml, scopeCss, resetScopeCounter } from './scope.js'

export async function renderComponent(component: ResolvedComponent, routeParams?: Record<string, string>): Promise<RenderOutput> {
  const children = await Promise.all(component.children.map(c => renderComponent(c, routeParams)))
  const output = await component.template({ content: component.content, children, params: routeParams })

  const scopeId = generateScopeId()
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

export async function renderPage(
  component: ResolvedComponent,
  routeParams?: Record<string, string>
): Promise<string> {
  resetScopeCounter()
  const children = await Promise.all(component.children.map(c => renderComponent(c, routeParams)))
  const output = await component.template({ content: component.content, children, params: routeParams })

  const headContent = [
    ...children.map(c => c.head).filter(Boolean),
    output.head,
  ].filter(Boolean).join('\n  ')

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
