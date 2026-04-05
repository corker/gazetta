import { z } from 'zod'
import type { TemplateFunction } from '@gazetta/core'

export const schema = z.object({
  title: z.string().describe('Heading'),
  subtitle: z.string().optional().describe('Subheading'),
  cta: z.string().optional().describe('Call to action text'),
  ctaHref: z.string().optional().describe('Call to action URL'),
})

const template: TemplateFunction = ({ content = {} }) => ({
  html: `<section class="hero">
  <div class="hero-inner">
    <h1>${content.title ?? ''}</h1>
    ${content.subtitle ? `<p class="hero-sub">${content.subtitle}</p>` : ''}
    ${content.cta ? `<a href="${content.ctaHref ?? '#'}" class="hero-cta">${content.cta}</a>` : ''}
  </div>
</section>`,
  css: `.hero { padding: 6rem 2rem; text-align: center; }
.hero-inner { max-width: 48rem; margin: 0 auto; }
.hero h1 { font-size: 3.5rem; font-weight: 800; line-height: 1.1; letter-spacing: -0.02em; background: linear-gradient(135deg, #a78bfa, #6d28d9); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.hero-sub { font-size: 1.25rem; color: #a1a1aa; margin-top: 1.5rem; max-width: 36rem; margin-left: auto; margin-right: auto; }
.hero-cta { display: inline-block; margin-top: 2rem; padding: 0.75rem 2rem; background: #7c3aed; color: white; border-radius: 8px; font-weight: 600; transition: background 0.15s; }
.hero-cta:hover { background: #6d28d9; color: white; }`,
  js: '',
})

export default template
