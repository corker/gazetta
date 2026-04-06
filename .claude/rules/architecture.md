# Architecture

## Product

Gazetta is a stateless CMS that structures websites as composable components.
See `design-concepts.md`, `design-publishing.md`, and `design-decisions.md` for full design.

## Terminology

Component is the base. Fragment and Page extend it.

```
Component (base)
  ├── Fragment (+ shared, reusable, @-referenced)
  └── Page (+ route, metadata)
```

## System Architecture

```
CMS (stateless web app)  <---->  Targets (state holders)
  apps/web/                        Storage + Hono runtime
        \                          /
         \                        /
          +-- Renderer (Hono) ---+
              packages/renderer/
```

- CMS is a web editor UI with no persistent storage
- Targets hold the site structure (templates, fragments, pages, manifests)
- Renderer is Hono-based engine, used by CMS, edge targets, and server targets
- Communication is bidirectional: publish to and fetch from targets

## Packages

| Package | Path | Purpose |
|---------|------|---------|
| web | `apps/web/` | CMS frontend — Vue 3 + PrimeVue shell, editor mounting, preview |
| renderer | `packages/renderer/` | Hono app — walks component tree, executes templates, composes pages |
| core | `packages/core/` | TypeScript types: component, fragment, page, target, template models |
| editor-default | `packages/editor-default/` | Default editor — @rjsf form wrapped in mount function |
| cli | `packages/cli/` | CLI tool (gazetta dev) |
| mcp-dev | `packages/mcp-dev/` | MCP dev server (screenshot tool for Claude Code) |

## CMS Architecture (apps/web)

The CMS is a shell that manages layout, navigation, and editor mounting.
Built with Vue 3 + Vite + PrimeVue (Tree, Splitter, Drawer, Toolbar).

All editors (default @rjsf forms and custom template editors) mount into DOM
elements via the `mount(el, { content, onChange })` / `unmount(el)` contract.
The shell doesn't render forms — it provides a `<div>` and calls mount.

```
┌─────────────────────────────────────────────┐
│ CMS Shell (Vue 3 + PrimeVue)                │
│ ┌──────────┐ ┌────────────┐ ┌─────────────┐ │
│ │ Site     │ │ Editor     │ │ Preview     │ │
│ │ Tree     │ │ Slot       │ │ (iframe)    │ │
│ │          │ │ ┌────────┐ │ │             │ │
│ │ pages/   │ │ │mounted │ │ │ Hono        │ │
│ │ frags/   │ │ │editor  │ │ │ renderer    │ │
│ │          │ │ └────────┘ │ │             │ │
│ └──────────┘ └────────────┘ └─────────────┘ │
└─────────────────────────────────────────────┘
```

API layer (Hono):
- `GET /api/pages` — list pages from target
- `GET /api/pages/:name` — get page manifest
- `PUT /api/pages/:name` — update page manifest
- `GET /api/fragments` — list fragments
- `GET /api/templates/:name/schema` — get template's JSON Schema
- `GET /api/preview/:route` — render page preview

## Storage Providers

| Provider | Package | Use case |
|----------|---------|----------|
| Filesystem | `packages/renderer/` | Local dev, filesystem targets |
| Azure Blob | `packages/renderer/` | Azure storage targets |
| S3 | `packages/renderer/` | AWS S3, Cloudflare R2, MinIO |

## Publishing

Two modes:
- **Raw publish** — copies files between storage providers (for dev/backup)
- **Rendered publish** — SSR's components at publish time, stores pre-rendered JSON in S3. Worker assembles pages from pre-rendered components at request time.

## Dependency direction

- `apps/*` may depend on `packages/*`
- `packages/*` must not depend on `apps/*`
- `packages/*` must not depend on other `packages/*` unless explicitly documented here
