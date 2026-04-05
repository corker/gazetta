import { z } from 'zod'
import type { TemplateFunction } from '@gazetta/core'

export const schema = z.object({
  heading: z.string().optional().describe('Section heading'),
  subheading: z.string().optional().describe('Section subheading'),
})

const template: TemplateFunction = ({ content = {}, children = [] }) => ({
  html: `<section class="section">
  <div class="section-inner">
    ${content.heading ? `<h2>${content.heading}</h2>` : ''}
    ${content.subheading ? `<p class="section-sub">${content.subheading}</p>` : ''}
    <div class="section-content">${children.map(c => c.html).join('\n')}</div>
  </div>
</section>`,
  css: `.section { padding: 3rem 2rem; }
.section-inner { max-width: 60rem; margin: 0 auto; }
.section h2 { font-size: 2rem; font-weight: 700; text-align: center; margin-bottom: 0.5rem; }
.section-sub { text-align: center; color: #a1a1aa; margin-bottom: 2rem; }
.section-content { margin-top: 2rem; display: flex; flex-direction: column; gap: 2rem; }
${children.map(c => c.css).join('\n')}`,
  js: children.map(c => c.js).filter(Boolean).join('\n'),
})

export default template
