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
  head: `<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='20' fill='%237c3aed'/><text x='50' y='72' font-size='70' font-weight='bold' fill='white' text-anchor='middle' font-family='sans-serif'>G</text></svg>">
  ${children.map(c => c.head).filter(Boolean).join('\n  ')}`,
})

export default template
