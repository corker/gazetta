import { z } from 'zod'
import type { TemplateFunction } from '@gazetta/core'

export const schema = z.object({})

const template: TemplateFunction = ({ children = [] }) => ({
  html: `<div class="site">${children.map(c => c.html).join('\n')}</div>`,
  css: `*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Inter', system-ui, -apple-system, sans-serif; color: #e4e4e7; background: #09090b; line-height: 1.6; }
a { color: #a78bfa; text-decoration: none; }
a:hover { color: #c4b5fd; }
.site { min-height: 100vh; display: flex; flex-direction: column; }
${children.map(c => c.css).join('\n')}`,
  js: children.map(c => c.js).filter(Boolean).join('\n'),
})

export default template
