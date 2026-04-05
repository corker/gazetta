import type { TemplateFunction } from '@gazetta/shared'

const template: TemplateFunction = ({ content = {} }) => ({
  html: `<section class="text-block">
  <h2>${content.heading ?? ''}</h2>
  <p>${content.body ?? ''}</p>
</section>`,
  css: `.text-block { padding: 3rem 2rem; max-width: 48rem; margin: 0 auto; }
.text-block h2 { font-size: 1.75rem; margin-bottom: 1rem; }
.text-block p { color: #555; }`,
  js: '',
})

export default template
