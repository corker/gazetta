import type { TemplateFunction } from '@gazetta/shared'

interface NavLink {
  label: string
  href: string
}

const template: TemplateFunction = ({ content = {} }) => {
  const links = (content.links ?? []) as NavLink[]
  return {
    html: `<nav class="site-nav">${links.map(l => `<a href="${l.href}">${l.label}</a>`).join('\n')}</nav>`,
    css: `.site-nav { display: flex; gap: 1.5rem; }
.site-nav a { text-decoration: none; color: #333; font-weight: 500; }
.site-nav a:hover { color: #667eea; }`,
    js: '',
  }
}

export default template
