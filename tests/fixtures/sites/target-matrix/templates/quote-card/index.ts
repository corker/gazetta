import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { z } from 'zod'
import type { TemplateFunction } from 'gazetta'

export const schema = z.object({
  quote: z.string().describe('Quote text'),
  author: z.string().describe('Author name'),
  role: z.string().optional().describe('Author role or title'),
})

type Content = z.infer<typeof schema>

const QuoteCard = (props: Content) => h('blockquote', { class: 'quote-card' }, [
  h('p', { class: 'quote-text' }, `"${props.quote}"`),
  h('footer', { class: 'quote-footer' }, [
    h('strong', props.author),
    props.role ? h('span', ` — ${props.role}`) : null,
  ]),
])

const template: TemplateFunction<Content> = async ({ content }) => {
  const app = createSSRApp(QuoteCard, content ?? {})
  const html = await renderToString(app)
  return {
    html,
    css: `.quote-card { padding: 1.5rem 2rem; border-left: 3px solid #667eea; background: #f8f9fa; border-radius: 0 8px 8px 0; margin: 1rem 0; }
.quote-text { font-style: italic; font-size: 1.125rem; margin-bottom: 0.75rem; color: #333; }
.quote-footer { font-size: 0.875rem; color: #666; }`,
    js: '',
  }
}

export default template
