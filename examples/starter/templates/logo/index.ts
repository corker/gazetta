import type { TemplateFunction } from '@gazetta/shared'

const template: TemplateFunction = ({ content = {} }) => ({
  html: content.href
    ? `<a class="site-logo" href="${content.href}">${content.text ?? ''}</a>`
    : `<span class="site-logo">${content.text ?? ''}</span>`,
  css: `.site-logo { font-size: 1.25rem; font-weight: 700; text-decoration: none; color: #1a1a1a; }`,
  js: '',
})

export default template
