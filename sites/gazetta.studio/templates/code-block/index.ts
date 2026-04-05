import { z } from 'zod'
import type { TemplateFunction } from '@gazetta/core'

export const schema = z.object({
  code: z.string().describe('Code content'),
  language: z.string().optional().describe('Language label'),
})

const template: TemplateFunction = ({ content = {} }) => ({
  html: `<div class="code-block">
  ${content.language ? `<span class="code-lang">${content.language}</span>` : ''}
  <pre><code>${(content.code as string ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>
</div>`,
  css: `.code-block { position: relative; background: #18181b; border: 1px solid #27272a; border-radius: 8px; overflow: hidden; }
.code-lang { position: absolute; top: 0.5rem; right: 0.75rem; font-size: 0.6875rem; color: #52525b; text-transform: uppercase; }
.code-block pre { padding: 1.25rem; overflow-x: auto; font-size: 0.875rem; line-height: 1.7; }
.code-block code { font-family: 'JetBrains Mono', 'Fira Code', monospace; color: #d4d4d8; }`,
  js: '',
})

export default template
