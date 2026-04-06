import { z } from 'zod'
import type { TemplateFunction } from 'gazetta'

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
  head: `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%238b5cf6'/%3E%3Crect x='7' y='7' width='8' height='8' rx='2' fill='white'/%3E%3Crect x='17' y='7' width='8' height='8' rx='2' fill='white' opacity='.6'/%3E%3Crect x='7' y='17' width='8' height='8' rx='2' fill='white' opacity='.6'/%3E%3Crect x='17' y='17' width='8' height='8' rx='2' fill='white' opacity='.3'/%3E%3C/svg%3E">
  ${children.map(c => c.head).filter(Boolean).join('\n  ')}`,
})

export default template
