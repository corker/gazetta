import { z } from 'zod'
import type { TemplateFunction } from '@gazetta/shared'

export const schema = z.object({})

const template: TemplateFunction = ({ children = [] }) => ({
  html: `<footer class="site-footer">
  <div class="footer-inner">${children.map(c => c.html).join('\n')}</div>
  <p class="footer-copy">&copy; 2026 Gazetta Studio. MIT License.</p>
</footer>`,
  css: `.site-footer { padding: 3rem 2rem 2rem; border-top: 1px solid #1c1c1f; margin-top: auto; }
.footer-inner { max-width: 60rem; margin: 0 auto; display: flex; gap: 4rem; flex-wrap: wrap; }
.footer-copy { max-width: 60rem; margin: 2rem auto 0; color: #3f3f46; font-size: 0.75rem; }
${children.map(c => c.css).join('\n')}`,
  js: children.map(c => c.js).filter(Boolean).join('\n'),
})

export default template
