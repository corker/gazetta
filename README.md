# Gazetta

A stateless CMS that structures websites as composable components.

No database. No build step. Pages are composed from reusable components at serve time.
The CMS stores nothing — all content lives in targets (filesystem, S3, Azure Blob).

## Key Ideas

- **Components** are the building block — each has a template, content, and optional children
- **Fragments** are shared components reusable across pages (header, footer, nav)
- **Pages** are components with a route and metadata
- **Templates** are pure functions `(params) => { html, css, js }` — use any framework (React, Svelte, Vue, plain TS)
- **The CMS is stateless** — it reads from and writes to targets. Lose the CMS, lose nothing.

## Quick Start

```bash
# Requirements: Node 22+
npm install
npm run build
npm run dev
# Open http://localhost:3000
```

This starts the renderer dev server with the starter example site.

## CMS Editor

```bash
npm run build
npx tsx apps/web/src/server/dev.ts examples/starter &
cd apps/web && npx vite --port 5173 &
# Open http://localhost:5173
```

The CMS editor provides:
- Site tree — browse pages and fragments
- Component tree — view and edit components within a page
- Schema-driven editor — forms auto-generated from Zod schemas
- Live preview — updates as you edit, without saving
- Save — writes changes to the target

## Project Structure

```
packages/
  shared/           TypeScript types (Component, Fragment, Page, Template, StorageProvider)
  renderer/         Hono-based renderer (site loader, resolver, CSS scoping, dev server)
  editor-default/   Default editor — @rjsf form wrapped in mount function
apps/
  web/              CMS frontend (Vue 3 + PrimeVue) + backend API (Hono)
examples/
  starter/          Sample site with templates, fragments, and pages
docs/
  design.md         Full design document
```

## How It Works

### Site Structure

```
site/
  site.yaml              # site manifest
  templates/             # developer-created, each with own deps
    hero/index.ts
    header-layout/index.ts
  fragments/             # shared components
    header/
      fragment.yaml      # template + children
      logo/component.yaml
      nav/component.yaml
    footer/
      fragment.yaml
  pages/                 # routable components
    home/
      page.yaml          # route + template + children
      hero/component.yaml
    about/
      page.yaml
    blog/
      [slug]/            # dynamic routes
        page.yaml
```

### Templates

A template is a pure function that returns HTML, CSS, and JS:

```ts
import { z } from 'zod'
import type { TemplateFunction } from '@gazetta/core'

export const schema = z.object({
  title: z.string().describe('Title'),
  subtitle: z.string().optional().describe('Subtitle'),
})

const template: TemplateFunction = ({ content = {} }) => ({
  html: `<section><h1>${content.title}</h1><p>${content.subtitle}</p></section>`,
  css: `section { padding: 2rem; }`,
  js: '',
})

export default template
```

Templates can use any framework — React, Svelte, Vue, plain TS. The starter example
includes both plain TS templates and a React template (feature-card using `renderToStaticMarkup`).

### Manifests

Pages and fragments use YAML manifests to define their template, content, and children:

```yaml
# pages/home/page.yaml
route: /
template: page-default
metadata:
  title: "Home"
components:
  - "@header"       # shared fragment
  - hero            # local component
  - "@footer"       # shared fragment
```

### Rendering

The renderer walks the component tree bottom-up:

1. Resolve children (recursively)
2. Call the template with content + rendered children
3. Scope CSS per component (PostCSS)
4. Assemble into a complete HTML document

### Editor

Each template exports a Zod schema. The CMS converts it to JSON Schema and auto-generates
an editor form using react-jsonschema-form. Templates can also export a custom editor via
the mount function contract `{ mount(el, props), unmount(el) }`.

## Documentation

- **[Getting Started](docs/getting-started.md)** — create a site, write templates, add pages and fragments
- **[Design](docs/design.md)** — full architecture and design decisions

## Design

See [docs/design.md](docs/design.md) for the full design document, including:
- Component/Fragment/Page hierarchy
- Stateless CMS with bidirectional target sync
- Static vs Dynamic vs Island components
- Edge runtime composition (Hono on WinterTC)
- Publishing model

## License

MIT
