import { z } from 'zod'
import type { TemplateFunction } from '@gazetta/core'

export const schema = z.object({})

const template: TemplateFunction = ({ children = [] }) => ({
  html: `<header class="site-header">${children.map(c => c.html).join('\n')}</header>`,
  css: `.site-header { display: flex; align-items: center; justify-content: space-between; padding: 1rem 2rem; background: #fff; border-bottom: 1px solid #eee; }
${children.map(c => c.css).join('\n')}`,
  js: children.map(c => c.js).filter(Boolean).join('\n'),
})

export default template
