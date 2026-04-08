import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { z } from 'zod'
import type { TemplateFunction } from 'gazetta'

export const schema = z.object({
  heading: z.string().describe('Heading text'),
  body: z.string().optional().describe('Body text'),
})

const template: TemplateFunction = async ({ content = {} }) => {
  const app = createSSRApp({
    render() {
      return h('section', { class: 'vue-test' }, [
        h('h2', content.heading ?? 'Vue Component'),
        content.body ? h('p', content.body) : null,
      ])
    },
  })
  const html = await renderToString(app)
  return {
    html,
    css: '.vue-test { padding: 2rem; border: 1px solid #333; }',
    js: '',
  }
}

export default template
