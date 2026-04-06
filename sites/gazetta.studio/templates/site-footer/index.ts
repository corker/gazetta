import { z } from 'zod'
import type { TemplateFunction } from 'gazetta'

export const schema = z.object({})

const template: TemplateFunction = ({ children = [] }) => ({
  html: `<footer class="site-footer">
  <div class="footer-inner">
    <div class="footer-brand">
      <strong>Gazetta</strong>
      <p>The stateless CMS for composable websites.</p>
    </div>
    <div class="footer-links">${children.map(c => c.html).join('\n')}</div>
  </div>
  <p class="footer-copy">&copy; 2026 Michael Borisov. MIT License.</p>
</footer>`,
  css: `.site-footer { padding: 3rem 2rem 2rem; border-top: 1px solid #1c1c1f; margin-top: auto; }
.footer-inner { max-width: 60rem; margin: 0 auto; display: flex; justify-content: space-between; gap: 4rem; flex-wrap: wrap; }
.footer-brand { max-width: 16rem; }
.footer-brand strong { font-size: 1rem; color: #e4e4e7; }
.footer-brand p { font-size: 0.8125rem; color: #52525b; margin-top: 0.5rem; }
.footer-links { display: flex; gap: 4rem; flex-wrap: wrap; }
.footer-copy { max-width: 60rem; margin: 2rem auto 0; color: #3f3f46; font-size: 0.75rem; }
${children.map(c => c.css).join('\n')}`,
  js: children.map(c => c.js).filter(Boolean).join('\n'),
})

export default template
