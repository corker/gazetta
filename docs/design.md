# Gazetta Design

Gazetta is an open-source CMS that rethinks how websites are authored and published.

## The Problem

Database-backed CMSes (WordPress, Strapi, Ghost) couple content authoring with a database
that must be maintained, backed up, and deployed. Publishing requires a build pipeline or
dynamic rendering. Losing the CMS means losing content.

Static site generators (Hugo, Jekyll, Astro) use files instead of databases but still follow
a one-directional flow: edit locally, build, deploy. There's no way to pull content back from
a deployed site or publish individual sections.

## The Idea

A website is a tree of **components**. Each component has a template, content, and optional
children. Components compose recursively — a component can contain other components.

Component is the base. Fragment and Page are specialized kinds of component.

```
Component (base)
  ├── Fragment (component + shared, reusable, @-referenced)
  └── Page (component + route + metadata)
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

The CMS is **stateless** — it stores nothing. All content lives in **targets** (S3, Git repos,
CDNs, file systems). The CMS fetches content from a target, lets the user edit it, and publishes
changes back. Any target can be a source or destination.

## Core Concepts

### Component

The building block. Has a template, content, and optional children.

- **Static** — content is data (text, markdown, yaml values)
- **Dynamic** — `.ts` — executes server-side, fetches data, computes values
- **Composite** — has children listed in its manifest

Every component has a template. Components compose recursively.

### Fragment (Shared Component)

A fragment is a component reusable across pages. Lives in `fragments/`.
Referenced with `@` prefix in page manifests.

```yaml
# fragments/header/fragment.json
template: header-layout
components:
  - logo
  - nav
  - search
```

### Template

An independent script created by developers: `(params) => { html, css, js, head? }`.
Returns only what the browser understands — no custom abstractions.

Each template is a self-contained package with its own dependencies. Developers choose the
framework — React, Svelte, Vue, plain TS, anything that can SSR to `{ html, css, js, head? }`.

```
templates/
  hero/
    package.json      # deps: react
    index.tsx         # React component
  newsletter/
    package.json      # deps: svelte
    index.svelte      # Svelte component
```

Developers build templates. Content authors fill them with data via components.

### Renderer

Built on **Hono** — a WinterTC-native HTTP framework that runs on Cloudflare Workers, Deno,
Bun, and Node. No existing framework (Astro, Next.js, SvelteKit, etc.) supports composing
pages from independently stored, multi-framework components at request time — all assume
build-time component knowledge. Hono is a library, not a full framework, so we build our
composition engine on top.

Walks the component tree bottom-up:

```
render(component):
  children = component.children.map(render)
  return component.template({ ...component.content, children })
```

Every component has a template. Leaf templates use content params. Composite templates
arrange their rendered children. The renderer doesn't know or care which framework
a template uses — it just calls the exported function.

Templates are pre-built independently (Vite or any bundler). The runtime doesn't build
anything — it assembles pre-built pieces at request time.

### Component Rendering Types

Three rendering types — a single page can mix all three:

| Type | Rendered | JS to browser | Use case |
|------|---------|---------------|----------|
| **Static** | Pre-rendered at publish time (Node/Bun) | Zero | Content that rarely changes |
| **Dynamic** | SSR'd at request time (Node/Bun server) | Zero | Fresh data from DB/API |
| **Island** | SSR'd on server + hydrated in browser | Framework + component | Client-side interactivity |

Static and dynamic components ship **zero JavaScript**. Only islands ship JS.

SSR (React, Vue, Svelte) runs outside of edge runtimes (they block dynamic code execution).
Edge runtimes only do composition — assembling pre-rendered HTML into pages.

| Target type | Runtime | Static components | Dynamic components | Islands |
|-------------|---------|-------------------|--------------------|---------|
| **Static** | Edge (Hono on Workers/Deno) | Pre-rendered HTML from storage | Not supported | Hydrated client-side |
| **Dynamic** | Node/Bun server (Hono) | Pre-rendered from cache | SSR'd fresh per request | SSR'd + hydrated |

Per-page import maps deduplicate shared island dependencies (React, Svelte, Chart.js, etc.).

### Page (Component + Route + Metadata)

A page is a component extended with route and metadata. More page fields will be added
as the design evolves.

```yaml
# pages/home/page.json
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

Dynamic routes use params: `route: /blog/:slug`

### Target

A target has two parts: **storage** and **runtime**.

- **Storage** — where templates, fragments, pages, and manifests live (S3, Azure Blob, filesystem)
- **Runtime** — Hono-based server that composes pages from components at request time

Two target types:
- **Static target** — edge runtime (Workers/Deno). Assembles pre-rendered HTML. For sites without dynamic SSR.
- **Dynamic target** — Node/Bun server. Can SSR dynamic components fresh per request. For sites needing DB/API data.

Publishing a fragment = push one file (pre-rendered HTML for static, source for dynamic).
All pages using it reflect the change on next request — no rebuild.

The same Hono-based runtime runs locally in the CMS (for preview), on edge, or on Node/Bun.

### CMS

A stateless web editor. Reads from targets, writes to targets. Disposable — spin up a new
instance and connect it to existing targets. No database, no local state.
Runs the same Hono-based runtime locally for preview — what-you-preview-is-what-you-serve.

## Operations

| Operation | Flow | Description |
|-----------|------|-------------|
| Publish | CMS -> target | Push pages/fragments to a target |
| Fetch | CMS <- target | Pull content from a target into the editor |
| Promote | Target -> target | Copy content between targets |
| Compare | Target <-> target | Diff two targets |

You can publish a page or a fragment. No full-site rebuilds. The edge runtime composes
pages from components at request time, so publishing a fragment (like a header) means
pushing one file — all pages using it are instantly updated on the next request.

## Site Structure

```
my-project/
  package.json
  admin/                # custom editors + fields (shared across sites)
    editors/
    fields/
  templates/            # developer-created (shared across sites)
    hero/
    card/
    article/
    header-layout/
    page-default/
  sites/
    main/               # site content
      site.yaml
      fragments/        # shared components (reusable across pages)
        header/
          fragment.json
          logo/
          nav/
        footer/
      pages/            # routable components
        home/
          page.json
          hero/
          featured/
        about/
          page.json
          bio/
        blog/
          [slug]/
            page.json
            article/
```

Templates and admin customizations live at the project root, shared across all sites.
Content (pages, fragments, site.yaml) lives inside `sites/{name}/`.

## What Makes This Different

| Traditional CMS | Gazetta |
|----------------|---------|
| Content in a database | Content as files in targets |
| CMS is the source of truth | Targets are the source of truth |
| Full site rebuild on change | Publish a fragment, all pages update instantly |
| One-way: CMS -> deploy | Bidirectional: push and pull |
| Lose the CMS, lose content | CMS is disposable |
| Page-level editing | Component-level composition |

## Competitive Landscape

Gazetta's model extends ideas from existing tools:
- **Hugo/Astro/Next.js** map filesystem folders to pages — Gazetta extends this to sub-page components
- **Storyblok/Contentful** support nested components — but only in a database, not as files
- **TinaCMS/Decap** sync with Git — but with a repo, not with deploy targets
- No known CMS is fully stateless with bidirectional target sync

## MVP — Local Dev Server

The first milestone proves the core concept: a Hono server that reads a site from the
filesystem and renders pages from composable components.

### What it includes

- `packages/renderer/` — Hono app that reads site structure, resolves fragments, renders pages
- Plain TS templates only (no React/Svelte/Vue yet)
- Filesystem as the storage provider
- Static components only (no dynamic SSR, no islands yet)
- Hot reload on file change
- A starter example site

### Developer experience

```bash
cd examples/starter
npm run dev          # starts local Hono server
# → open http://localhost:3000
# → edit a template or content → see the change
```

### What it proves

- Component/Fragment/Page model works
- Recursive composition works
- Manifest-based ordering works
- Fragment reuse across pages works
- Templates as pure functions work
- Filesystem-based site structure works

### What's been built

| Feature | Status |
|---------|--------|
| React templates (multi-framework SSR) | Done |
| Storage providers (Filesystem, Azure Blob, S3) | Done |
| CMS editor UI (Vue + PrimeVue, schema-driven forms) | Done |
| Publish/fetch between targets | Done |
| Rendered publish (SSR at publish time, assembly at serve time) | Done |
| Edge caching with purge strategies | Done |
| CLI tool (`gazetta dev`) | Done |

### What's next

| Feature | Status |
|---------|--------|
| Deploy to Cloudflare Workers + R2 | Planned |
| Dynamic components (SSR at request time) | Planned |
| Islands (client hydration + import maps) | Planned |
| Compare targets (diff before publishing) | Planned |

## CMS Editor Model

The CMS generates editor UIs automatically from component schemas:

1. **Schema-driven forms** — every template exports a Zod schema. The CMS converts it to
   JSON Schema and renders an editor form using @rjsf (react-jsonschema-form) with shadcn theming.
2. **Custom editors** — templates can export a `mount(el, { content, onChange })` /
   `unmount(el)` function. Any framework — React, Svelte, Vue, vanilla JS.
Priority: custom editor > schema-driven form.

```ts
// Template exports (all optional except default renderer)
export default (params) => { html, css, js, head? }                    // renderer (required)
export const schema = z.object({ title: z.string(), ... })      // Zod schema (required)
export const editor = { mount(el, props), unmount(el) }         // custom editor (optional)
```

## CMS Shell

Built with Vue 3 + Vite + PrimeVue. The shell is a layout manager — it does not generate
forms or render content. All editors mount into DOM elements via the mount function contract.

```
┌──────────────────────────────────────────────┐
│ Toolbar (publish, save, settings)            │
├──────────┬─────────────┬─────────────────────┤
│ Site     │ Editor      │ Preview             │
│ Tree     │ (mounted)   │ (iframe → Hono)     │
│          │             │                     │
│ pages/   │ @rjsf form  │ rendered page       │
│ frags/   │ or custom   │                     │
│          │ editor      │                     │
└──────────┴─────────────┴─────────────────────┘
```

### v1 Features
- Target selector (connect to filesystem target)
- Site tree (pages + fragments)
- Component tree within a page
- Schema-driven content editing (@rjsf mounted via mount function)
- Live preview (Hono renderer in iframe)
- Publish page/fragment to target
- Authentication (token-based)

### v2 Features
- Multi-target management, compare, promote
- Draft/published states
- Fragment dependency view
- Media library
- User roles and permissions
- Device preview (responsive widths)

## Open Questions

- **Target protocol**: What API do targets expose? REST? Git-based? S3-compatible?
- **Conflict resolution**: What happens when CMS and target have diverged?
- **Authentication**: How does the CMS authenticate with targets?
