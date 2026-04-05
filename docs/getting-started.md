# Getting Started

This guide walks you through creating a Gazetta site from scratch.

## Prerequisites

- Node.js 22+
- Clone the repo and install dependencies:

```bash
git clone https://github.com/corker/gazetta.git
cd gazetta
npm install
npm run build
```

## 1. Create a Site

A Gazetta site is a folder with a `site.yaml` and three directories:

```
my-site/
  site.yaml
  templates/
  fragments/
  pages/
```

Create it:

```bash
mkdir -p my-site/{templates,fragments,pages}
```

Add `site.yaml`:

```yaml
# my-site/site.yaml
name: "My Site"
```

## 2. Create a Template

A template is a pure function that returns `{ html, css, js }`. Every template
must also export a Zod schema describing its content.

Create a simple hero template:

```bash
mkdir my-site/templates/hero
```

```ts
// my-site/templates/hero/index.ts
import { z } from 'zod'
import type { TemplateFunction } from '@gazetta/shared'

export const schema = z.object({
  title: z.string().describe('Heading'),
  subtitle: z.string().optional().describe('Subheading'),
})

const template: TemplateFunction = ({ content = {} }) => ({
  html: `<section class="hero">
  <h1>${content.title ?? ''}</h1>
  <p>${content.subtitle ?? ''}</p>
</section>`,
  css: `.hero {
  padding: 4rem 2rem;
  text-align: center;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
}
.hero h1 { font-size: 2.5rem; margin-bottom: 1rem; }
.hero p { font-size: 1.25rem; opacity: 0.9; }`,
  js: '',
})

export default template
```

**Key points:**
- `export default` — the render function (required)
- `export const schema` — Zod schema for content validation and CMS form generation (required)
- The function receives `{ content, children, params }`
- Returns `{ html, css, js }` — nothing else

## 3. Create a Page Layout Template

Pages need a layout template that wraps children:

```bash
mkdir my-site/templates/page-layout
```

```ts
// my-site/templates/page-layout/index.ts
import { z } from 'zod'
import type { TemplateFunction } from '@gazetta/shared'

export const schema = z.object({})

const template: TemplateFunction = ({ children = [] }) => ({
  html: `<main>${children.map(c => c.html).join('\n')}</main>`,
  css: `*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: system-ui, sans-serif; color: #1a1a1a; line-height: 1.6; }
${children.map(c => c.css).join('\n')}`,
  js: children.map(c => c.js).filter(Boolean).join('\n'),
})

export default template
```

**Composite templates** receive `children` — the rendered output of child components.
They decide how to arrange them (flex, grid, stack, etc.).

## 4. Create a Page

A page is a folder under `pages/` with a `page.yaml` manifest:

```bash
mkdir -p my-site/pages/home/hero
```

```yaml
# my-site/pages/home/page.yaml
route: /
template: page-layout
metadata:
  title: "Home"
components:
  - hero
```

Each component listed in `components` needs a `component.yaml`:

```yaml
# my-site/pages/home/hero/component.yaml
template: hero
content:
  title: "Hello World"
  subtitle: "My first Gazetta site"
```

## 5. Run the Dev Server

```bash
npx tsx packages/renderer/src/dev.ts my-site
```

Open http://localhost:3000 — you should see your page.

Edit `hero/component.yaml`, change the title — the browser reloads automatically.

## 6. Add a Shared Fragment

Fragments are reusable components shared across pages. Create a footer:

```bash
mkdir -p my-site/templates/footer-layout
mkdir -p my-site/fragments/footer/copyright
```

```ts
// my-site/templates/footer-layout/index.ts
import { z } from 'zod'
import type { TemplateFunction } from '@gazetta/shared'

export const schema = z.object({})

const template: TemplateFunction = ({ children = [] }) => ({
  html: `<footer style="padding:2rem;text-align:center;background:#f5f5f5">
  ${children.map(c => c.html).join('\n')}
</footer>`,
  css: children.map(c => c.css).join('\n'),
  js: children.map(c => c.js).filter(Boolean).join('\n'),
})

export default template
```

```bash
mkdir my-site/templates/text
```

```ts
// my-site/templates/text/index.ts
import { z } from 'zod'
import type { TemplateFunction } from '@gazetta/shared'

export const schema = z.object({
  text: z.string().describe('Text content'),
})

const template: TemplateFunction = ({ content = {} }) => ({
  html: `<p>${content.text ?? ''}</p>`,
  css: '',
  js: '',
})

export default template
```

```yaml
# my-site/fragments/footer/fragment.yaml
template: footer-layout
components:
  - copyright
```

```yaml
# my-site/fragments/footer/copyright/component.yaml
template: text
content:
  text: "© 2026 My Site"
```

Now add it to your page with the `@` prefix:

```yaml
# my-site/pages/home/page.yaml
route: /
template: page-layout
metadata:
  title: "Home"
components:
  - hero
  - "@footer"
```

Note: `@` references must be quoted in YAML (`"@footer"`) since `@` is a reserved character.

Restart the dev server — the footer now appears on every page that references `@footer`.

## 7. Use React (or Any Framework)

Templates can use any framework that SSR's to HTML. Here's a React template:

```bash
mkdir my-site/templates/card
```

```tsx
// my-site/templates/card/index.tsx
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { z } from 'zod'
import type { TemplateFunction } from '@gazetta/shared'

export const schema = z.object({
  title: z.string().describe('Card title'),
  body: z.string().describe('Card body'),
})

function Card({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ padding: '1.5rem', border: '1px solid #eee', borderRadius: '8px' }}>
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  )
}

const template: TemplateFunction = ({ content = {} }) => ({
  html: renderToStaticMarkup(
    <Card title={content.title as string ?? ''} body={content.body as string ?? ''} />
  ),
  css: '',
  js: '',
})

export default template
```

Make sure `react` and `react-dom` are installed as dev dependencies in your site.

## 8. Dynamic Routes

For blog posts, products, or any parameterized content:

```bash
mkdir -p my-site/pages/blog/\[slug\]/article
```

```yaml
# my-site/pages/blog/[slug]/page.yaml
route: /blog/:slug
template: page-layout
metadata:
  title: "Blog Post"
components:
  - article
```

```yaml
# my-site/pages/blog/[slug]/article/component.yaml
template: hero
content:
  title: "A Blog Post"
  subtitle: "Written with Gazetta"
```

The `[slug]` folder maps to `:slug` in the route. Templates receive route params:

```ts
const template: TemplateFunction = ({ content = {}, params = {} }) => ({
  html: `<h1>${content.title ?? params.slug}</h1>`,
  // ...
})
```

## Template Contract Summary

Every template file must export:

| Export | Required | Type |
|--------|----------|------|
| `default` | Yes | `(params: { content?, children?, params? }) => { html, css, js }` |
| `schema` | Yes | Zod schema (e.g., `z.object({ title: z.string() })`) |
| `editor` | No | `{ mount(el, { content, onChange }), unmount(el) }` |

- `content` — data from the component's YAML manifest
- `children` — rendered output of child components (for composite templates)
- `params` — URL route parameters (e.g., `{ slug: "hello-world" }`)

## What's Next

- See `examples/starter/` for a complete working site
- See `docs/design.md` for the full architecture
- Run the CMS editor: see the README for instructions
