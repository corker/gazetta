import type { RenderOutput, ResolvedComponent } from '@gazetta/shared'

export function renderComponent(component: ResolvedComponent): RenderOutput {
  const children = component.children.map(renderComponent)
  return component.template({ content: component.content, children })
}

export function renderPage(component: ResolvedComponent, metadata?: Record<string, unknown>): string {
  const output = renderComponent(component)
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
