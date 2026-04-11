# Getting Started with Gazetta

## Prerequisites

- Node.js 22+

## Create a site

```bash
npx gazetta init my-site
cd my-site
npm install
```

This scaffolds:
- A home page with a hero and text block
- A shared header fragment (nav bar)
- Templates: page-layout, hero, nav, text-block

## Start the dev server

```bash
npx gazetta dev
```

- **http://localhost:3000** — your site
- **http://localhost:3000/admin** — CMS editor

The server watches for changes and reloads automatically.

## Templates

A template is a TypeScript function that returns `{ html, css, js }`. Every template exports a Zod schema for its content.

```ts
// templates/hero/index.ts
import { z } from 'zod'
import type { TemplateFunction } from 'gazetta'

export const schema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
})

type Content = z.infer<typeof schema>

const template: TemplateFunction<Content> = ({ content }) => ({
  html: `<section class="hero">
  <h1>${content?.title ?? ''}</h1>
  <p>${content?.subtitle ?? ''}</p>
</section>`,
  css: `.hero { padding: 4rem 2rem; text-align: center; }
.hero h1 { font-size: 2.5rem; }`,
  js: '',
})

export default template
```

### Template fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `html` | string | Yes | HTML markup |
| `css` | string | Yes | CSS (scoped per component automatically) |
| `js` | string | Yes | Client-side JavaScript (`''` for static components) |
| `head` | string | No | Content for `<head>` — favicons, fonts, meta tags |

### Frameworks

Templates can use any framework that SSR's to HTML:

**React:**
```tsx
import { renderToStaticMarkup } from 'react-dom/server'

const template: TemplateFunction<Content> = ({ content }) => ({
  html: renderToStaticMarkup(<Card {...content!} />),
  css: `.card { padding: 1.5rem; }`,
  js: '',
})
```

**Vue 3:**
```ts
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'

const template: TemplateFunction<Content> = async ({ content }) => {
  const app = createSSRApp(Quote, content ?? {})
  return { html: await renderToString(app), css: '...', js: '' }
}
```

**Interactive components** return JS that runs in the browser:
```ts
const template: TemplateFunction<Content> = ({ content }) => ({
  html: `<button id="btn">Click me</button>`,
  css: `button { padding: 0.5rem 1rem; }`,
  js: `document.getElementById('btn').addEventListener('click', () => alert('Hi'))`,
})
```

### Composite templates

Layout templates receive `children` — the rendered output of child components:

```ts
const template: TemplateFunction = ({ children = [] }) => ({
  html: `<main>${children.map(c => c.html).join('\n')}</main>`,
  css: `main { max-width: 800px; margin: 0 auto; }
${children.map(c => c.css).join('\n')}`,
  js: children.map(c => c.js).filter(Boolean).join('\n'),
  head: children.map(c => c.head).filter(Boolean).join('\n'),
})
```

## Pages

A page is a folder with a `page.yaml` manifest. The route is derived from the folder path — `pages/about/` becomes `/about`:

```yaml
# pages/about/page.yaml
template: page-layout
content:
  title: About
  description: About our company
components:
  - "@header"       # shared fragment
  - about-text      # local component
  - "@footer"       # shared fragment
```

Local components live in subfolders:

```yaml
# pages/about/about-text/component.yaml
template: text-block
content:
  body: "<p>We build composable websites.</p>"
```

Or create pages in the CMS — click **New page** in the admin UI.

### Dynamic routes

Use `[param]` in the folder name — it becomes `:param` in the route:

```yaml
# pages/blog/[slug]/page.yaml → /blog/:slug
template: blog-post
components:
  - article
```

Templates receive route params:

```ts
const template: TemplateFunction<Content> = ({ content, params }) => ({
  html: `<h1>${content?.title ?? params?.slug}</h1>`,
  ...
})
```

## Fragments

Fragments are shared components reusable across pages. They live in `fragments/` and are referenced with `@`:

```yaml
# fragments/header/fragment.yaml
template: nav
content:
  brand: My Site
  links:
    - label: Home
      href: /
    - label: About
      href: /about
```

Reference in any page with `"@header"`. Update the fragment once — every page reflects it.

> Note: `@` in YAML must be quoted: `"@header"`.

## CMS editor

1. Open **http://localhost:3000/admin**
2. Click a page → see its component tree with live preview
3. Click any component or fragment → edit its content
4. Toggle **Edit mode** in the preview toolbar → click components directly in the preview to select them
5. Edit content → preview updates live as you type
6. Click **Save** → writes to disk
7. Click **Publish** → pre-renders and uploads to target

## Custom editors

The CMS auto-generates forms from template schemas using @rjsf. You can replace the
default form with a custom editor for any template.

### Create a custom editor

Create `admin/editors/{template-name}.tsx`:

```tsx
// admin/editors/hero.tsx
import React, { useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { DefaultEditorForm } from 'gazetta/editor'
import type { EditorMount } from 'gazetta/types'

function HeroEditor({ content, schema, onChange }) {
  const [data, setData] = useState(content)
  const handleChange = (c) => { setData(c); onChange(c) }

  return (
    <div>
      {/* Your custom preview */}
      <div style={{ padding: '1.5rem', background: 'linear-gradient(135deg, #667eea, #764ba2)', borderRadius: 8, color: '#fff', textAlign: 'center', marginBottom: '1rem' }}>
        <h2>{data.title || 'Untitled'}</h2>
        {data.subtitle && <p style={{ opacity: 0.85 }}>{data.subtitle}</p>}
      </div>

      {/* Default form for the fields */}
      <DefaultEditorForm schema={schema} content={data} onChange={handleChange} />
    </div>
  )
}

const roots = new WeakMap()
const editor: EditorMount = {
  mount(el, props) {
    const root = createRoot(el); roots.set(el, root)
    root.render(<HeroEditor {...props} />)
  },
  unmount(el) { roots.get(el)?.unmount(); roots.delete(el) },
}
export default editor
```

The custom editor loads automatically when you select a hero component in the CMS.
Templates without a custom editor use the default auto-generated form.

### What custom editors receive

| Prop | Type | Description |
|------|------|-------------|
| `content` | `Record<string, unknown>` | Current content values |
| `schema` | `Record<string, unknown>` | JSON Schema for the template |
| `theme` | `'dark' \| 'light'` | Current admin theme |
| `onChange` | `(content) => void` | Call when content changes |

### Embedding the default form

Import `DefaultEditorForm` from `gazetta/editor` to embed the auto-generated form
inside your custom editor. This gives you the best of both: custom UI on top, standard
form fields below.

## Custom fields

Custom fields are reusable widgets that replace individual form fields inside the
default @rjsf form. Unlike custom editors (which replace the entire form), custom
fields target a single property.

### Create a custom field

Create `admin/fields/{field-name}.tsx`:

```tsx
// admin/fields/brand-color.tsx
import React, { useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { FieldMount } from 'gazetta/types'

const PRESETS = [
  { label: 'Indigo', value: '#667eea' },
  { label: 'Purple', value: '#764ba2' },
  { label: 'Coral', value: '#f97066' },
]

function BrandColorPicker({ value, theme, onChange }) {
  const [color, setColor] = useState(value || '#667eea')
  const handleChange = (v) => { setColor(v); onChange(v) }

  return (
    <div>
      <div style={{ height: 48, borderRadius: 8, background: color }} />
      <div style={{ display: 'flex', gap: '0.375rem' }}>
        {PRESETS.map(p => (
          <button key={p.value} onClick={() => handleChange(p.value)}
            style={{ width: 28, height: 28, borderRadius: 6, background: p.value, border: 'none', cursor: 'pointer' }} />
        ))}
      </div>
      <input type="color" value={color} onChange={e => handleChange(e.target.value)} />
    </div>
  )
}

const roots = new WeakMap()
const brandColor: FieldMount = {
  mount(el, { value, theme, onChange }) {
    const root = createRoot(el); roots.set(el, root)
    root.render(<BrandColorPicker value={String(value ?? '')} theme={theme} onChange={onChange} />)
  },
  unmount(el) { roots.get(el)?.unmount(); roots.delete(el) },
}
export default brandColor
```

### Reference a custom field in a template schema

Use `format.field('field-name')` in the Zod schema:

```ts
// templates/banner/index.ts
import { z } from 'zod'
import { format } from 'gazetta'

export const schema = z.object({
  heading: z.string().describe('Banner heading'),
  background: z.string().meta(format.field('brand-color')).describe('Background color'),
})
```

The `brand-color` field widget loads automatically when editing a component that uses
the `banner` template. Other fields in the schema use the default form inputs.

### What custom fields receive

| Prop | Type | Description |
|------|------|-------------|
| `value` | `unknown` | Current field value |
| `schema` | `Record<string, unknown>` | JSON Schema for this property |
| `theme` | `'dark' \| 'light'` | Current admin theme |
| `onChange` | `(value) => void` | Call when the value changes |

### Custom fields + custom editors

- **No custom editor** — custom fields work inside the default @rjsf form
- **Custom editor with `DefaultEditorForm`** — custom fields work inside the embedded form
- **Custom editor without `DefaultEditorForm`** — custom fields are NOT used (the custom editor controls everything)

## Publishing

> **Deploying to Cloudflare?** See the [Cloudflare deployment guide](./cloudflare.md).
> **Self-hosting?** See the [self-hosted deployment guide](./self-hosted.md) for VPS, Docker, and Fly.io.

### Target types

Each target has a **storage** config (where files go) and an optional **worker** config (what serves them):

| Storage type | Use case | Config |
|------|----------|--------|
| `r2` | Cloudflare R2 | `accountId`, `bucket` |
| `s3` | AWS S3, MinIO | `endpoint`, `bucket`, `accessKeyId`, `secretAccessKey` |
| `filesystem` | Local dev, staging, backups | `path: ./dist/staging` |
| `azure-blob` | Azure Blob Storage | `connectionString`, `container` |

| Worker type | Use case |
|-------------|----------|
| `cloudflare` | Cloudflare Workers — ESI assembly at the edge |
| (none) | No worker — just publish files to storage |

### Configure targets

```yaml
# site.yaml
name: My Site
targets:
  staging:
    storage:
      type: filesystem
      path: ./dist/staging
  production:
    storage:
      type: r2
      accountId: "your-cloudflare-account-id"
      bucket: "my-site"
    worker:
      type: cloudflare
    siteUrl: "https://mysite.com"
    cache:
      browser: 0
      edge: 86400
      purge:
        type: cloudflare
        apiToken: "${CLOUDFLARE_API_TOKEN}"
```

### Authentication

**Local dev:** Run `npx wrangler login` once. The CLI uses your wrangler session to access R2 — no API keys needed.

**CI (GitHub Actions):** Create a Cloudflare API token in the dashboard with these permissions:

| Permission | Access |
|-----------|--------|
| Account / Workers Scripts | Edit |
| Account / R2 | Edit |
| User / User Details | Read |
| User / Memberships | Read |
| Zone / Workers Routes | Edit |
| Zone / Cache Purge | Purge |
| Zone / Zone | Read |

Add it as a `CLOUDFLARE_API_TOKEN` secret in your repo settings.

**Environment variables:** Create a `.env` file in your site directory (gitignored) for local secrets:

```
CLOUDFLARE_API_TOKEN=your-token-here
```

The CLI loads `.env` automatically. In CI, env vars are set directly — `.env` is skipped when `CI=true`.

Values in site.yaml can reference env vars with `${VAR_NAME}` syntax — they're resolved at runtime.

### Publish and deploy

```bash
npx gazetta publish                   # publish to default target
npx gazetta publish production        # publish to specific target
npx gazetta deploy production         # deploy worker (one-time setup)
```

`publish` pre-renders pages and uploads to storage. `deploy` deploys the worker that serves them. Deploy once, publish as often as you want.

The publish mode is automatic based on the target config:

**With worker** (Cloudflare, edge hosting):
- Pages have ESI placeholders for fragments
- Fragments stored separately — update one, all pages reflect it
- Hashed CSS/JS files with immutable caching
- Worker assembles pages at request time

**Without worker** (GitHub Pages, Netlify, Vercel):
- Pages are fully assembled — fragments baked in
- One self-contained HTML file per page
- CSS/JS inline — no external files
- Fragment changes require republishing all pages

### Custom 404 page

Create a `pages/404/` page like any other page. It's automatically served with a 404 status when a route doesn't match. The URL stays as-is — no redirect.

```yaml
# pages/404/page.yaml
template: page-default
content:
  title: "Page Not Found"
components:
  - "@header"
  - error-message
  - "@footer"
```

Works with both `gazetta serve` and Cloudflare Workers. Fragments are assembled normally.

### Cache configuration

Per target:
```yaml
cache:
  browser: 0       # max-age — seconds before browser revalidates
  edge: 86400      # s-maxage — seconds before edge refetches from storage
  purge:           # optional — purge CDN cache after publish
    type: cloudflare
    apiToken: "${CLOUDFLARE_API_TOKEN}"
```

Per page (overrides target):
```yaml
# pages/dashboard/page.yaml
cache:
  browser: 0      # always fresh
```

Defaults: `browser: 0`, `edge: 86400`. Set `edge: 0` to skip CDN caching entirely (no purge needed).

ETags are automatic — browsers get `304 Not Modified` for unchanged pages.

When `cache.purge` is configured, `gazetta publish` automatically purges the CDN cache after uploading. The zone ID is auto-detected from `siteUrl`.

## Site structure

```
my-project/
  package.json
  admin/                     # custom editors + fields (shared across sites)
    editors/
      hero.tsx
    fields/
      brand-color.tsx
  templates/                 # developer-created templates (shared across sites)
    hero/index.ts
    nav/index.ts
    page-layout/index.ts
  sites/
    main/                    # site content
      site.yaml              # site manifest + targets
      fragments/             # shared components
        header/fragment.yaml
      pages/                 # routable pages
        home/
          page.yaml
          hero/component.yaml
        about/
          page.yaml
        blog/
          [slug]/page.yaml   # dynamic route
```

Templates and admin customizations are at the project root, shared across all sites.
Content (pages, fragments, site.yaml) lives inside `sites/{name}/`.

## Next steps

- Browse the [starter example](../examples/starter/) for more templates
- Read the [design document](design.md) for architecture details
- Check out the [contributing guide](../CONTRIBUTING.md) to get involved
