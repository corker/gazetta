import { z } from 'zod'
import type { TemplateFunction } from '@gazetta/core'

export const schema = z.object({
  text: z.string().describe('Copyright text'),
})

const template: TemplateFunction = ({ content = {} }) => ({
  html: `<p class="copyright">${content.text ?? ''}</p>`,
  css: `.copyright { color: #888; font-size: 0.875rem; }`,
  js: '',
})

export default template
