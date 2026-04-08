import { z } from 'zod'
import type { TemplateFunction } from 'gazetta'

export const schema = z.object({
  title: z.string().describe('Page title'),
  description: z.string().optional().describe('Page description'),
})

type Content = z.infer<typeof schema>

const template: TemplateFunction<Content> = ({ content, children = [] }) => ({
  html: `<main>${children.map(c => c.html).join('\n')}</main>`,
  css: `*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: system-ui, -apple-system, sans-serif; color: #1a1a1a; line-height: 1.6; }
main { min-height: 100vh; display: flex; flex-direction: column; }
${children.map(c => c.css).join('\n')}`,
  js: children.map(c => c.js).filter(Boolean).join('\n'),
  head: `<title>${content?.title ?? ''}</title>
${content?.description ? `<meta name="description" content="${content.description}">` : ''}
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>">
${children.map(c => c.head).filter(Boolean).join('\n')}`,
})

export default template
