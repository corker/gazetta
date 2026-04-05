# Design Concepts

Gazetta is a stateless CMS where content is structured as composable components.
The CMS holds no state — all content lives in targets.

## Component Hierarchy

Component is the base. Fragment and Page are specialized kinds of component.

```
Component (base)
  ├── Fragment (component + shared, reusable, @-referenced)
  └── Page (component + route + metadata)
```

```ts
interface Component {
  template: string
  content?: Record<string, any>
  components?: (string | `@${string}`)[]
}

interface Fragment extends Component {
  // shared, lives in fragments/, referenced with @
}

interface Page extends Component {
  route: string
  metadata?: Record<string, any>
}
```

| | Component | Fragment | Page |
|---|---|---|---|
| Has template | Yes | Yes | Yes |
| Has content | Yes | Yes | Yes |
| Has children | Optional | Optional | Optional |
| Shared / reusable | No (local) | Yes (`fragments/`) | No |
| Has route | No | No | Yes |
| Has metadata | No | No | Yes |
| Referenced with `@` | No | Yes | No |

## Other Primitives

| Concept | Definition |
|---------|-----------|
| Template | An independent script: `(params) => { html, css, js }`. Created by developers. Can use any framework. |
| Target | Storage + WinterTC runtime. Where state lives and pages are served. |
| CMS | A stateless editor UI. Reads from and writes to targets. Stores nothing locally. |

## Templates

A template is an independent script with its own dependencies. Developers choose the framework.
Every template must conform to the same contract:

```ts
export default (params: { content, children? }) => {
  html: string,
  css: string,
  js: string
}
```

Each template is a self-contained package:

```
templates/
  hero/
    package.json      # deps: react
    index.tsx         # React component
  newsletter/
    package.json      # deps: svelte
    index.svelte      # Svelte component
  footer/
    package.json      # no framework
    index.ts          # plain tagged templates
```

| Role | Creates | Concern |
|------|---------|---------|
| Developer | Templates | Structure, style, behavior (any framework) |
| Content author | Components (pages + fragments) | Data, content, ordering |

## Template Exports

A template can export up to three things:

```ts
// Required: renderer
export default (params: { content, children?, params? }) => { html, css, js }

// Optional: content schema (Zod → converted to JSON Schema for form generation)
export const schema = z.object({ title: z.string(), ... })

// Optional: custom editor (mount function — framework-agnostic)
export const editor = {
  mount(el: HTMLElement, props: { content, onChange }): void
  unmount(el: HTMLElement): void
}
```

## CMS Editor Model

The CMS auto-generates editor UIs from component schemas using JSON Schema form generation
(@rjsf). Templates can override with a custom editor via the mount function pattern.

Editor priority:
1. **Custom editor** — if template exports `editor`, mount it (framework-agnostic)
2. **Schema-driven form** — if schema exists (Zod export or JSON Schema in YAML), auto-generate form
3. **Raw YAML editor** — fallback for components with no schema

The mount function contract follows the single-spa micro-frontend pattern:
- `mount(el, { content, onChange })` — render editor into the provided DOM element
- `unmount(el)` — clean up (remove listeners, destroy framework instance)
- Works with React (`createRoot`), Svelte 5 (`mount`), Vue 3 (`createApp`), or vanilla JS

Content schema can be declared in two places:
- In `component.yaml` as JSON Schema (for content authors)
- As a Zod `export const schema` in the template (for developers, converted via zod-to-json-schema)

## Component Rendering Types

Every component has a rendering type that determines where and when it renders:

| Type | Rendered where | JS shipped | When to use |
|------|---------------|------------|-------------|
| **Static** | At publish time (Node/Bun). Pre-rendered HTML stored in target. | Zero | Content that rarely changes |
| **Dynamic** | At request time on server (Node/Bun). Fresh HTML per request. | Zero | Fresh data from DB/API per request |
| **Island** | SSR'd on server + hydrated in browser. | Framework + component | Client-side interactivity (maps, editors, real-time) |

Static and dynamic components ship **zero JavaScript**. Only islands ship JS to the browser.

A single page can mix all three:

```
Page: /products
├── @header          → static (pre-rendered at publish)     → 0 JS
├── product-list     → dynamic (fresh from DB per request)  → 0 JS
├── search           → island (needs client interactivity)  → JS
└── @footer          → static (pre-rendered at publish)     → 0 JS
```

Components can also be **composite** — having children listed in their manifest.
Any rendering type can be composite.

Every component — leaf or composite — has a template.

## Rendering

The renderer walks the component tree bottom-up. One rule:

```
render(component):
  children = component.children.map(render)
  return component.template({ ...component.content, children })
```

1. Render children first (if any)
2. Call the component's template with content params + rendered children

```tsx
// Leaf template — hero
export default ({ content }) => ({
  html: `<section><h1>${content.title}</h1></section>`,
  css: `section { background: navy; }`,
  js: ``,
})

// Composite template — header layout
export default ({ children }) => ({
  html: `<header>${children.map(c => c.html).join('')}</header>`,
  css: `header { display: flex; }
    ${children.map(c => c.css).join('\n')}`,
  js: children.map(c => c.js).join('\n'),
})
```

Both CMS and targets use the same Hono-based runtime for rendering.
CMS wraps output with editing UI. Targets serve clean HTML.

## Rendering Architecture

SSR (running templates with React, Vue, Svelte) cannot run on edge runtimes (Cloudflare
Workers, Deno Deploy) — they block dynamic code execution. So rendering is split:

| Where | What it does |
|-------|-------------|
| **Publish time** (Node/Bun) | SSR static components → pre-rendered HTML stored in target |
| **Request time** (Node/Bun server) | SSR dynamic components → fresh HTML per request |
| **Edge** (Hono on Workers/Deno) | Composition only — assembles pre-rendered HTML into pages |
| **Browser** | Island hydration — only for interactive components |

For **static targets** (edge composition): all components are pre-rendered at publish time.
Publishing a fragment = SSR that fragment, push HTML to storage. Edge assembles on request.

For **dynamic targets** (Node/Bun server): static components served from cache, dynamic
components SSR'd per request, islands hydrated in browser.

Import maps deduplicate island dependencies per page — React, Svelte, Chart.js, etc.
loaded once regardless of how many islands use them.

## Fragments (Shared Components)

Fragments live in `fragments/` and are referenced with `@` in page manifests.
They are reusable across any page. The `@` tells the runtime to resolve from `fragments/`.

```yaml
# fragments/header/fragment.yaml
template: header-layout
components:
  - logo
  - nav
  - search
```

## Page = Component + Route + Metadata

A page is a component with route and metadata. `page.yaml` extends the component manifest.
More page fields will be added as the design evolves.

```yaml
# pages/home/page.yaml
route: /home
metadata:
  title: "Home"
  description: "Welcome to our site"
  og:image: /images/home.png
template: page-default
components:
  - @header         # fragment — from fragments/
  - hero            # local component
  - featured        # local component
  - @footer         # fragment — from fragments/
```

```yaml
# pages/blog/[slug]/page.yaml — dynamic route
route: /blog/:slug
metadata:
  title: "Blog Post"
template: page-blog
components:
  - @header
  - article
  - @footer
```

## Site Structure

```
site/
  site.yaml
  templates/          # developer-created, each with own package.json
    hero/
    card/
    article/
    header-layout/
    page-default/
  fragments/          # shared components (reusable across pages)
    header/
      fragment.yaml
      logo/
      nav/
      search/
    footer/
    newsletter/
  pages/              # routable components
    home/
      page.yaml
      hero/
      featured/
    about/
      page.yaml
      bio/
    blog/
      [slug]/
        page.yaml
        article/
```
