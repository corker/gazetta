import { z } from 'zod'
import type { TemplateFunction } from '@gazetta/core'

export const schema = z.object({
  body: z.string().describe('Text content (HTML allowed)'),
})

const template: TemplateFunction = ({ content = {} }) => ({
  html: `<div class="text-content">${content.body ?? ''}</div>`,
  css: `.text-content { font-size: 1rem; color: #a1a1aa; line-height: 1.8; max-width: 48rem; }
.text-content p { margin-bottom: 1rem; }
.text-content strong { color: #e4e4e7; }
.text-content code { background: #18181b; padding: 0.125rem 0.375rem; border-radius: 4px; font-size: 0.875rem; }`,
  js: '',
})

export default template
