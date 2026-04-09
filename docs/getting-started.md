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

## Publishing

> **Deploying to Cloudflare?** See the [Cloudflare deployment guide](./cloudflare.md) for complete setup instructions.

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
npx gazetta publish                   # publish content to all targets
npx gazetta publish -t production     # publish to specific target
npx gazetta deploy -t production      # deploy worker (one-time setup)
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
my-site/
  site.yaml                  # site manifest + targets
  templates/                 # developer-created templates
    hero/index.ts
    nav/index.ts
    page-layout/index.ts
  fragments/                 # shared components
    header/fragment.yaml
  pages/                     # routable pages
    home/
      page.yaml
      hero/component.yaml
    about/
      page.yaml
    blog/
      [slug]/page.yaml       # dynamic route
  package.json
```

## Next steps

- Browse the [starter example](../examples/starter/) for more templates
- Read the [design document](design.md) for architecture details
- Check out the [contributing guide](../CONTRIBUTING.md) to get involved
