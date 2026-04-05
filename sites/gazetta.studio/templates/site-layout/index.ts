import { z } from 'zod'
import type { TemplateFunction } from '@gazetta/core'

export const schema = z.object({})

const template: TemplateFunction = ({ children = [] }) => ({
  html: `<div class="site">${children.map(c => c.html).join('\n')}</div>`,
  css: `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Inter', system-ui, -apple-system, sans-serif; color: #e4e4e7; background: #09090b; line-height: 1.6; }
a { color: #a78bfa; text-decoration: none; }
a:hover { color: #c4b5fd; }
.site { min-height: 100vh; display: flex; flex-direction: column; }
${children.map(c => c.css).join('\n')}`,
  js: children.map(c => c.js).filter(Boolean).join('\n'),
  head: `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='14' fill='%238b5cf6'/><path d='M32 14a18 18 0 1 0 18 18h-10a8 8 0 1 1-8-8 8 8 0 0 1 6 2.7l7-7A18 18 0 0 0 32 14zM40 32v8H32v-8z' fill='white'/></svg>">
  ${children.map(c => c.head).filter(Boolean).join('\n  ')}`,
})

export default template
