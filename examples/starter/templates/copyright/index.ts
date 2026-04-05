import type { TemplateFunction } from '@gazetta/shared'

const template: TemplateFunction = ({ content = {} }) => ({
  html: `<p class="copyright">${content.text ?? ''}</p>`,
  css: `.copyright { color: #888; font-size: 0.875rem; }`,
  js: '',
})

export default template
