# Configurations

How Gazetta is developed, configured, and deployed. Use this to reason about which
code paths, storage providers, publish modes, and CLI commands apply to a given scenario.

## Development Modes

| Mode | Who | What they run | What they edit |
|------|-----|---------------|----------------|
| **Gazetta contributor** | Core developer | `npm run dev` from monorepo root (builds core, starts starter) | `packages/gazetta/`, `apps/admin/` |
| **Site author (new)** | End user | `npx gazetta init my-site && cd my-site && gazetta dev` | `templates/`, `sites/*/fragments/`, `sites/*/pages/`, `sites/*/site.yaml` |
| **Site author (existing)** | End user | `gazetta dev` in project dir | Same as above |
| **Template developer** | Frontend dev | `gazetta dev` — builds/tests templates in a site context | `templates/` (schema, render fn) + `admin/editors/` (custom editors) |
| **Admin UI developer** | Core developer | `npm run dev` from `apps/admin/` (Vite UI :3000 + Hono API :4000) | `apps/admin/src/client/`, `apps/admin/src/server/` |

The monorepo `npm run dev` starts `examples/starter` which has both filesystem and Azure Blob
targets configured — exercises most code paths locally.

## Site Topology

| Setup | Structure | site.yaml targets | Use case |
|-------|-----------|-------------------|----------|
| **Single site** | `sites/main/` (default from `gazetta init`) | 1+ targets | Most sites |
| **Multi-site monorepo** | Multiple dirs under `sites/` sharing templates | Each site has own `site.yaml` | Agency, multi-brand |

Multi-site: each site is independent. CLI operates on one site at a time (`gazetta publish production my-site`).
Templates and admin are shared across all sites in the project.

## File Structures

### Gazetta monorepo (contributor / core developer)

```
gazetta/
  package.json                 # workspaces: ["packages/*", "apps/*", "examples/*", "sites/*"]
  packages/
    gazetta/                   # Core package — renderer, CLI, admin API, editor, storage providers
      src/
        cli/                   # CLI commands (dev, publish, build, deploy, serve, validate)
        admin-api/             # Hono API routes (pages, fragments, templates, preview, publish)
        editor/                # Default editor — @rjsf form, Tiptap, custom widgets
        types.ts               # EditorMount, FieldMount, TemplateModule, etc.
      package.json             # peerDependencies: { react, react-dom }
  tools/
    mcp-dev/                   # MCP dev server (screenshot tool)
  apps/
    admin/                  # CMS admin frontend — Vue 3 + PrimeVue shell
      src/client/              # Vue SPA (stores, components, composables, router)
      src/server/              # Dev server entry
      vite.config.ts
  examples/
    starter/                   # Example site (exercises most code paths)
  sites/
    gazetta.studio/            # Production site (dogfooding)
```

### Site project (site author / template developer)

Templates and admin are project-level (shared across sites). Content (fragments, pages) lives in `sites/`.

```
my-project/
  package.json                 # workspaces: ["admin", "templates"]
  admin/                       # Custom editors + fields (browser, CMS-aligned) — workspace
    package.json               # deps: { gazetta, react, react-dom, @radix-ui, ... }
    editors/                   # Custom editors (per-template full replacements)
      hero.tsx                 # EditorMount for templates/hero
    fields/                    # Custom fields (reusable widgets)
      brand-color.tsx          # FieldMount — referenced in schemas as { field: 'brand-color' }
  templates/                   # Template render functions + schemas (server) — workspace
    package.json               # deps: { gazetta, react, svelte, zod, ... }
    hero/index.tsx             # template name: "hero"
    card/index.ts              # template name: "card"
    page-default/index.tsx     # template name: "page-default"
    nav/index.svelte           # non-React template
    buttons/                   # optional subfolders for design systems
      primary/index.tsx        # template name: "buttons/primary"
      cta/index.tsx            # template name: "buttons/cta"
  sites/
    my-site/                   # A site — content + config
      site.yaml                # Site manifest — name, targets
      fragments/               # Shared components (reusable across pages)
        header/
          fragment.yaml
          logo/
          nav/
        footer/
      pages/                   # Routable components
        home/
          page.yaml
          hero/
          features/
        about/
          page.yaml
    another-site/              # Another site — same templates, different content
      site.yaml
      fragments/
      pages/
```

**Modularity — what belongs to what:**

| Concept | Scope | Runs where | Deps aligned with | Lives in |
|---------|-------|-----------|-------------------|----------|
| Template (render + schema) | Project | Server (Node) | Shared (workspace) | `templates/` (flat, optional subfolders) |
| Editor (custom editing UI) | Project | Browser (admin) | Admin UI (same React) | `admin/editors/` |
| Field (custom widget) | Project | Browser (admin, inside @rjsf) | Admin UI (same React) | `admin/fields/` |
| Fragment (content) | Site | Server (rendered) | Templates | `sites/x/fragments/` |
| Page (content) | Site | Server (rendered) | Templates | `sites/x/pages/` |

Templates are flat by default. Subfolders are opt-in for grouping (e.g. `buttons/primary`, `cards/product`). A template doesn't inherently know its usage — the same template can serve as a page, fragment, or component template. The type is decided by the content (page.yaml, fragment.yaml), not by the template.

Templates, editors, and fields are shared across all sites in the project. Fragments and pages are per-site.

Editors are conceptually 1:1 with templates but dependency-coupled to the admin. `admin/editors/hero.tsx` is the editor for `templates/hero/` — connected by name, not file path.

**Type access:** Editors import **types only** from templates via `import type` (erased at runtime, no cross-workspace dependency). Templates export a content type: `export type HeroContent = z.infer<typeof schema>`. Editors import it: `import type { HeroContent } from '@templates/hero'`. The `@templates` alias is configured in `tsconfig.json` paths.

**Dependencies:**
- `admin/` and `templates/` are npm workspaces — **one `npm install`** at the project root. `sites/` are just directories (no code, no deps).
- By default, templates share the project's React version. Non-React templates (Svelte, Vue, plain TS) don't conflict.
- Edge case: if templates need a different React version, remove `templates` from workspaces and run `cd templates && npm install` separately (or use pnpm which handles version isolation natively).

**Install:**
```
cd my-project && npm install    # everything — admin + templates workspaces
```

## Storage Providers

| Provider | Type in site.yaml | Auth (local) | Auth (CI) | Init |
|----------|-------------------|-------------|-----------|------|
| **Filesystem** | `filesystem` | None (file access) | None | Auto-creates dirs |
| **Cloudflare R2** | `r2` | `wrangler login` (REST API) or `accessKeyId`+`secretAccessKey` (S3 API) | `accessKeyId`+`secretAccessKey` via env vars | Creates bucket if needed |
| **AWS S3 / MinIO** | `s3` | `accessKeyId`+`secretAccessKey` | Same, via env vars | Creates bucket if needed |
| **Azure Blob** | `azure-blob` | `connectionString` (supports Azurite `UseDevelopmentStorage=true`) | `connectionString` via env var | Creates container if needed |

All providers implement `StorageProvider` interface: `readFile`, `readDir`, `exists`, `writeFile`, `mkdir`, `rm`.

Credentials use `${ENV_VAR}` syntax in site.yaml, resolved at runtime. CLI loads `.env` from
site dir (skipped when `CI=true`).

R2 has two auth modes:
- **REST API** (default): uses wrangler auth token, sequential uploads. Good for local dev.
- **S3 API** (when `accessKeyId` + `secretAccessKey` set): parallel uploads. Required for CI.

## Target Configurations

A target = storage + optional worker + optional cache + optional publishMode.

| Target type | Worker config | Publish mode | Serve mode | Fragment updates |
|-------------|--------------|--------------|------------|-----------------|
| **Edge (Cloudflare)** | `worker: { type: cloudflare }` | ESI — pages have `<!--esi:-->` placeholders, fragments stored separately | Cloudflare Worker assembles at edge | Instant — republish fragment only |
| **Self-hosted server** | `publishMode: esi` (no worker needed) | ESI — same as edge | Node/Bun Hono server via `gazetta serve` | Instant — republish fragment only |
| **Static hosting** | No worker, no server | Static — pages fully assembled, fragments baked in | GitHub Pages / Netlify / S3 / any file server | Requires republishing all pages using that fragment |

Decision logic: determined by `publishMode` field in target config (default: `static` if no worker, `esi` if worker configured).

**Known gaps:**

- **Publish mode is coupled to worker config.** Currently `gazetta serve` targets need
  `worker: { type: cloudflare }` to get ESI mode. Fix: add `publishMode: esi | static` field
  to target config (shown in the self-hosted example above). Default: `esi` if worker configured, `static` otherwise.

- **Admin API always publishes ESI mode** (`admin-api/routes/publish.ts`). It calls
  `publishPageRendered()` / `publishFragmentRendered()` regardless of target config. CLI branches
  correctly. This means CLI and admin UI produce different output for static targets. Fix: admin API
  must check `publishMode` and branch like the CLI does.

### Real-world target examples

```yaml
# Local dev — filesystem, static mode
staging:
  storage: { type: filesystem, path: ./dist/staging }

# Cloudflare — R2 + Worker, ESI mode
production:
  storage: { type: r2, accountId: "...", bucket: "my-site", accessKeyId: "${R2_ACCESS_KEY_ID}", secretAccessKey: "${R2_SECRET_ACCESS_KEY}" }
  worker: { type: cloudflare, name: my-site }
  siteUrl: "https://mysite.com"
  cache: { browser: 0, edge: 86400, purge: { type: cloudflare, apiToken: "${CLOUDFLARE_API_TOKEN}" } }

# Azure Blob — local dev with Azurite emulator
production:
  storage: { type: azure-blob, connectionString: "UseDevelopmentStorage=true", container: "my-site" }

# Self-hosted — S3 storage, served by gazetta serve
production:
  storage: { type: s3, endpoint: "https://s3.amazonaws.com", bucket: "my-site", region: "us-east-1", accessKeyId: "${AWS_ACCESS_KEY_ID}", secretAccessKey: "${AWS_SECRET_ACCESS_KEY}" }
  publishMode: esi  # ESI for gazetta serve — no worker needed
```

### Invalid/misleading combinations

| Combination | What happens | Problem |
|-------------|-------------|---------|
| R2 + no worker | Publishes static HTML to R2 | Can't serve — no worker at edge, `gazetta serve` from cloud R2 is inefficient |
| Filesystem + worker config | Publishes ESI mode, `gazetta serve` works | Worker name is dead config — `gazetta deploy` would try to deploy to Cloudflare from local files |
| `cache.purge` on non-Cloudflare target | Purge silently skipped | User thinks cache is purged, but it's not. Only `purge.type: cloudflare` is implemented |
| `worker.type` other than `cloudflare` | `gazetta deploy` fails with error | `WorkerConfig.type` is `string` but only `'cloudflare'` is handled. Should be a literal type |

## Publish Sources

| Source | Command / action | Runs where | Typical use |
|--------|-----------------|------------|-------------|
| **CLI** | `gazetta publish [target]` | Developer machine or CI | Full site publish |
| **Admin UI** | Publish button → `POST /api/publish` | Browser → dev server API | Per-page/fragment publish during editing |
| **CI/CD** | `gazetta publish production` in GitHub Actions | CI runner | Automated publish on push |

CLI and CI use the same publish functions. Publish mode (ESI vs static) is determined by
the target's `publishMode` field (default: `esi` if worker configured, `static` otherwise).
The admin API resolves dependencies (fragments required by a page) and handles per-item
cache purge, but **always uses ESI mode** — does not check `publishMode` (see gap #1 above).

### CI/CD pattern (GitHub Actions)

```yaml
- npm ci
- gazetta publish production
  env: { CLOUDFLARE_API_TOKEN, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY }
# If deploying worker (rare — on Gazetta upgrade or first setup):
- gazetta build
- gazetta deploy production
```

## Serve Modes

| Mode | Command | Runtime | What it does |
|------|---------|---------|-------------|
| **Dev server** | `gazetta dev` | Node (Hono) | Renders on-the-fly from source, hot reload via SSE, admin UI at /admin |
| **Node production** | `gazetta serve` | Node/Bun (Hono) | ESI assembly from storage, ETag/304, Cache-Control headers |
| **Cloudflare Worker** | `gazetta build && gazetta deploy production` | Cloudflare Workers (Hono) | ESI assembly from R2, Cache API, edge distribution |
| **Static file server** | Any web server (nginx, Caddy, etc.) | None | Serves pre-baked HTML files directly |

`gazetta dev` and `gazetta serve` are different code paths:
- `dev` uses the renderer directly, watches files, supports admin UI
- `serve` reads pre-rendered HTML from storage and assembles ESI

## Future Hosting Platforms

Gazetta is built on Hono, which runs on WinterTC edge runtimes, Node.js, and Bun. This opens
many deployment targets beyond what's currently implemented.

### Edge/Worker platforms (ESI page assembly at the edge)

| Platform | Hono adapter | WinterTC | CDN | Free tier | Status |
|----------|-------------|----------|-----|-----------|--------|
| **Cloudflare Workers** | `hono/cloudflare-workers` | Yes | Global | 100K req/day | Implemented |
| **Cloudflare Pages + Functions** | `hono/cloudflare-pages` | Yes | Global | Unlimited static, 100K fn/day | Future — static + functions in one |
| **Deno Deploy** | `hono/deno` | Yes | 35+ regions | 1M req/mo | Future |
| **Vercel Edge Functions** | `hono/vercel` | Yes | Global | 100 GB/mo | Future |
| **Netlify Edge Functions** | `hono/netlify` | Yes (Deno-based) | Global | 100 GB/mo | Future |
| **Fastly Compute** | `@fastly/hono-fastly-compute` | Yes (WASM) | Global | Trial only | Future — niche |
| **AWS Lambda@Edge** | `hono/lambda-edge` | No (Node.js) | CloudFront | 1M req/mo | Future |

### Server platforms (dynamic SSR, preview, admin hosting)

| Platform | Hono adapter | Containers | Scale-to-zero | Free tier | Notes |
|----------|-------------|-----------|---------------|-----------|-------|
| **Node/Bun (self-hosted)** | `@hono/node-server` / `hono/bun` | N/A | N/A | N/A | Current (`gazetta serve`) |
| **Fly.io** | Via Node/Bun | Docker | No (min 1 machine) | Pay-as-you-go | Good for always-on servers |
| **Google Cloud Run** | Via Node/Bun | Docker | Yes | 2M req/mo | Best serverless container option |
| **Railway** | Via Node/Bun | Docker | No | $5 trial credit | Simple DX, no free tier |
| **Render** | Via Node/Bun | Docker | Yes (free spins down) | 512 MB / 0.1 CPU | Free tier spins down after 15 min |
| **Azure Container Apps** | Via Node/Bun | Docker | Yes | 180K vCPU-sec/mo | Good Azure integration |
| **AWS Lambda** | `hono/aws-lambda` | Serverless | Yes | 1M req/mo | Cold starts, not ideal for admin |

### Static hosting (pre-built admin SPA or static target output)

| Platform | CDN | Free tier | Notes |
|----------|-----|-----------|-------|
| **GitHub Pages** | Yes | Unlimited (public) | Good for docs, simple sites |
| **Netlify** | Yes | 100 GB/mo | Popular, good DX |
| **Vercel** | Yes | 100 GB/mo | Popular, good DX |
| **Cloudflare Pages** | Yes | Unlimited | Best free tier |
| **Azure Blob static website** | Via Azure CDN | 5 GB storage | Implemented as storage provider |
| **AWS S3 + CloudFront** | Yes | 1 TB/mo (12 mo trial) | Implemented as storage provider |
| **Firebase Hosting** | Yes | 10 GB storage | Google ecosystem |

### Admin UI hosting (future)

The admin UI currently only runs in dev mode (`gazetta dev`). For production admin hosting,
the admin needs three things: static SPA assets, the Hono API (server-side, needs storage + template access),
and custom editor/field bundles (site-specific browser code).

**All-in-one (SPA + API in single process) — recommended:**

| Platform | How | Custom editors | Preview SSR | Auth | Notes |
|----------|-----|---------------|-------------|------|-------|
| **`gazetta serve` + admin** | Node/Bun process serves SPA + API on one port | Full — filesystem access to editor bundles | Full — Node SSR | Middleware | WordPress model. Simplest. Add behind reverse proxy (Caddy/nginx) for HTTPS |
| **Docker** | Containerized Node/Bun. Same as above | Full | Full | Middleware | Deploy to Fly.io, Railway, Render, Cloud Run, Azure Container Apps, any VPS |
| **Fly.io** | Docker container, global edge network | Full | Full | Middleware | Good for always-on admin. ~$2/mo min |
| **Google Cloud Run** | Docker container, scale-to-zero | Full | Full | IAM or middleware | Best serverless container. Cold start ~1s |
| **Railway** | Docker container, no scale-to-zero | Full | Full | Middleware | Simple DX. $5/mo min |
| **Render** | Docker container, free tier spins down | Full | Full | Middleware | Free tier has 15-min spin-down — bad for admin UX |

**Split deployment (SPA separate from API):**

| SPA host | API host | Custom editors | Notes |
|----------|----------|---------------|-------|
| **Vercel/Netlify/CF Pages** (static) | **Serverless function** (same platform) | Pre-bundled — editors built into SPA or served from API | SPA at `admin.mysite.com`, API as serverless. CORS needed if different origins |
| **Vercel** (static + Edge) | **Vercel Serverless** | Pre-bundled | One platform, two runtimes. Edge for SPA, serverless for API |
| **Cloudflare Pages** (static + Workers) | **Cloudflare Workers** | Pre-bundled | Pages for SPA, Worker for API. R2 for storage. All Cloudflare |
| **Netlify** (static + Edge) | **Netlify Functions** | Pre-bundled | Pages for SPA, Functions for API |

Split deployments require:
- CORS configuration (SPA and API on different origins/subdomains)
- Custom editors must be pre-bundled during `gazetta build` (no on-the-fly serving)
- Two deploys to coordinate on every admin change
- Auth on both SPA (protect routes) and API (validate tokens)

**Not viable for admin:**

| Platform | Why not |
|----------|---------|
| **Pure edge (Workers/Deno Deploy)** | Admin API needs Node.js for template loading (jiti), preview SSR, and storage provider SDKs. WinterTC runtimes lack these |
| **GitHub Pages** | Static only — no API |
| **S3/Azure Blob static** | Static only — no API |
| **AWS Lambda@Edge** | 5s timeout, 1MB response limit, Node.js only (no Bun). Too constrained for preview rendering |

## CLI Commands

### Principles

- **Zero arguments for the common case.** Single-site, single-target = no flags needed.
- **Auto-detect everything.** Site, target, mode — inferred from project structure.
- **Arguments are escape hatches** for multi-site and multi-target.

### Lifecycle

```
init → dev → publish
         ↘ build → deploy  (setup / upgrade)
```

`publish` is the daily command. `build` + `deploy` are for infrastructure setup.

### Commands

| Command | What it does | When to use |
|---------|-------------|-------------|
| `gazetta init [dir]` | Scaffold project + install deps | Once — start a new project |
| `gazetta dev` | Dev server + CMS admin | Every day — develop, edit, customize |
| `gazetta publish [target]` | Render content + push to storage | Go live — frequent, on every content change |
| `gazetta build` | Build admin UI + worker code | Before deploy or serve — infrastructure prep |
| `gazetta deploy [target]` | Deploy built worker to edge | Rare — initial setup or Gazetta upgrade |
| `gazetta serve` | Production server | Self-hosting — serves site + built admin |
| `gazetta validate` | Check for errors | Before publish — catches broken references |

```
gazetta publish                    # render + push to default target
gazetta publish production         # render + push to production
gazetta publish staging            # render + push to staging
gazetta build                      # build admin UI + worker
gazetta deploy production          # deploy worker to production
```

### Auto-detection

| What | One | Multiple (local) | Multiple (CI) | Override |
|------|-----|-------------------|---------------|----------|
| **Site** | Auto-select | Prompt user to choose | Fail with error | `gazetta dev my-site` |
| **Target** | Auto-select | Prompt user to choose | Fail with error | `gazetta publish production` |

CI is detected via `CI=true` environment variable (set by GitHub Actions, GitLab CI, etc.).

```
# One site, one target — zero arguments:
gazetta dev                               # auto-detects
gazetta publish                           # auto-detects

# Multiple sites — local prompts, CI fails:
gazetta dev
> ? Select site: (use arrow keys)
>   my-site
>   another-site

# Multiple targets — same:
gazetta publish
> ? Select target: (use arrow keys)
>   staging
>   production

# CI — must be explicit:
CI=true gazetta publish
> Error: multiple targets found. Specify one: gazetta publish staging

# Explicit always works:
gazetta dev my-site
gazetta publish production
gazetta publish production my-site
```

### Command details

**`gazetta init [dir]`**

Scaffolds a new project and runs `npm install`. Ready to `gazetta dev` immediately.

```
$ npx gazetta init my-site
$ cd my-site
$ gazetta dev

Creates:
  my-site/
    package.json           # workspaces: ["admin", "templates"]
    admin/
      package.json         # gazetta, react, react-dom
      editors/             # (empty — ready for custom editors)
      fields/              # (empty — ready for custom fields)
    templates/
      package.json         # gazetta, react, zod
      hero/index.tsx       # starter template
      page-default/index.tsx
    sites/
      main/
        site.yaml          # name + filesystem staging target
        fragments/
        pages/
          home/page.yaml
```

**`gazetta dev`**

The developer's primary command. Starts everything needed for local development.

- Auto-detects site in `sites/`
- Loads templates from `templates/`
- Starts Hono server (site routes + admin API + preview)
- Starts Vite dev server (admin SPA + HMR)
- Injects Vite config: `resolve.alias: { '@site': projectRoot }`, `server.fs.allow`
- Custom editors/fields loaded via Vite from `admin/editors/`, `admin/fields/`
- Dev playground at `/admin/dev`
- File watcher for template/content hot reload via SSE
- Output: `http://localhost:3000` (site), `http://localhost:3000/admin` (CMS)

**`gazetta publish [target]`**

Renders content and pushes it to a target. The daily production command.

- Auto-detects site + target (first target if not specified)
- Renders pages and fragments using templates (SSR)
- Uploads to target storage (R2, S3, Azure Blob, filesystem)
- Handles ESI vs static mode based on target config
- Purges CDN cache if configured

```
gazetta publish                # render + push to default target
gazetta publish production     # explicit target
gazetta publish staging        # different target
```

**`gazetta build`**

Builds the admin UI and worker code. Run before `deploy` or `serve`.

- Builds admin SPA via Vite `build()` API → `dist/admin/`
- Bundles custom editors/fields with esbuild → `dist/admin/editors/`, `dist/admin/fields/`
- Generates import map for shared deps → injected into `dist/admin/index.html`
- Generates worker code per target (each target has its own storage/cache config) → `dist/workers/{target}/`

**`gazetta deploy [target]`**

Deploys the built worker to a target's edge platform. Rare — only on initial setup or Gazetta upgrades.
Each target has its own worker (different storage, cache, URL).

- Requires `gazetta build` first
- Deploys worker from `dist/workers/{target}/` to the target's platform
- Currently: Cloudflare Workers
- Future: Deno Deploy, Vercel Edge, Netlify Edge

```
gazetta deploy production      # deploy worker to production
gazetta deploy staging         # deploy worker to staging
```

**`gazetta serve`**

Production server. For self-hosting on a VPS, container, or local machine.

- Auto-detects site + target
- Serves site: ESI assembly from target storage (published content via `gazetta publish`)
- Serves admin: built SPA + API at `/admin` (from `dist/admin/` via `gazetta build`)
- Requires both: target storage access (for content) AND local `dist/admin/` (for admin UI)
- Auth middleware on `/admin/*` routes

**`gazetta validate`**

Checks the project for errors before publishing.

- Validates template references, fragment references, page manifests
- Future: target connectivity, env var validation, custom editor/field checks

## Edge Cases & Behavior

### Admin UI in dev mode — source vs pre-built

In the monorepo, `gazetta dev` runs Vite against `apps/admin/` source — full HMR on admin UI.

In a site project (gazetta installed from npm), the admin SPA is **pre-built** inside the
gazetta package (`admin-dist/`). `gazetta dev` serves it as static files. No Vite needed
for the admin shell. Custom editors/fields still get HMR via Vite (they're in the developer's
project). Site developers don't modify the admin shell — they customize via editors/fields.

| Context | Admin UI | Custom editors/fields | HMR scope |
|---------|----------|----------------------|-----------|
| Monorepo | Compiled from source via Vite | Compiled from source via Vite | Everything |
| Site project (npm) | Pre-built from package | Compiled from source via Vite | Custom code only |

In site projects, `gazetta dev` runs a Vite dev server alongside the pre-built admin.
The pre-built admin loads custom editors/fields from the Vite dev server URL (e.g.
`http://localhost:3000/@site/admin/editors/hero.tsx`). Vite transforms TypeScript and
provides HMR for these files. The admin shell itself is static — no HMR on Vue components.

### Project root detection

CLI commands find the project root by walking up from the current directory looking for
`package.json` with `workspaces` containing `"admin"` and `"templates"`. Templates are
at `{projectRoot}/templates/`, admin at `{projectRoot}/admin/`, sites at `{projectRoot}/sites/`.

### CLI availability

`admin/package.json` lists `gazetta` as a dependency. npm hoists it to the project root.
After `npm install`, the `gazetta` binary is available at `./node_modules/.bin/gazetta`.
Scripts in root `package.json` can use `gazetta` directly. For shell usage, developers
use `npx gazetta dev` or add to PATH. `gazetta init` uses `npx gazetta init` (before install).

### Empty admin/ (no custom editors or fields)

Works. The admin UI loads the default @rjsf form for all templates. `admin/editors/` and
`admin/fields/` are empty directories — no files needed. Custom editors/fields are opt-in.

### Multi-site target resolution

Resolution order: site first, then target.
1. Auto-detect or specify site → determines which `site.yaml` to read
2. Auto-detect or specify target → looked up in that site's `site.yaml`

Two sites can have targets with the same name (e.g. both have "production") — they're
independent. `gazetta publish production my-site` resolves unambiguously.

### `gazetta serve` without `gazetta build`

If `dist/admin/` doesn't exist, `serve` runs the site without the admin UI. The site
works (ESI assembly from storage). `/admin` returns a message: "Run `gazetta build` to
enable the admin UI."

### `.env` loading

CLI loads `.env` and `.env.local` from the **project root** (where `package.json` with
workspaces lives), not from inside `sites/`. This is where credentials and environment
variables are configured. Skipped when `CI=true`.

### Who creates custom fields?

Site authors and template developers can both create custom fields. The development modes
table shows template developers editing `admin/editors/`, but site authors may also add
fields to `admin/fields/`. Any developer with access to `admin/` can create editors or fields.

### Validation of custom editors and fields

`gazetta validate` should check:
- Every `admin/editors/{name}.tsx` has a matching `templates/{name}/` directory
- Every `meta({ field: 'name' })` in a template schema has a matching `admin/fields/{name}.tsx`
- Orphaned editors (editor exists but template doesn't) are warnings
- Missing fields (schema references a field that doesn't exist) are errors

### Orphaned editors

If `templates/hero/` is deleted but `admin/editors/hero.tsx` still exists, the editor
is never loaded (no template = no component = no editor mount). `gazetta validate` reports
it as a warning. The `import type` in the editor would fail TypeScript compilation, catching
it at dev time.

### `gazetta serve` target selection

`serve` auto-detects the first target in `site.yaml`. For sites with multiple targets
(staging + production), the developer should specify: `gazetta serve production`.
Default is the first target — usually staging/filesystem for local development.

### Self-hosting deployment workflow

```
# On VPS or container:
git clone <repo> && cd my-project
npm install
gazetta build                    # build admin + worker
gazetta publish production       # render + push content to storage
gazetta serve production -p 3000   # start server
```

Or with Docker — `gazetta init` creates a `Dockerfile` that runs `build` + `serve`.

### Custom field naming

Field files support subfolders like templates: `admin/fields/colors/brand.tsx` is
referenced as `{ field: 'colors/brand' }`. Flat is default, subfolders for grouping.

### Custom editor naming for subfolder templates

Editor names mirror template paths. Template `buttons/primary` (at `templates/buttons/primary/`)
has editor `admin/editors/buttons/primary.tsx`. The directory structure inside `admin/editors/`
mirrors `templates/`.

### Admin UI publish button vs CLI publish

Both use the same render pipeline. The admin UI `POST /api/publish` renders the specific
page/fragment being edited and pushes it to the target. CLI `gazetta publish` renders
all pages and fragments. Same SSR, same storage upload, different scope (single item vs full site).

### Auth for production admin

`gazetta serve` protects `/admin/*` routes via auth middleware. Auth method configured
in `site.yaml`:

```yaml
admin:
  auth: basic                    # HTTP Basic Auth
  users:
    - { username: admin, password: "${ADMIN_PASSWORD}" }
```

Future: OAuth, API key, custom middleware. For now, Basic Auth behind HTTPS (reverse proxy).

### Port configuration

`gazetta dev` and `gazetta serve` default to port 3000. Override with `--port` or `-p`:

```
gazetta dev --port 4000
gazetta serve -p 8080
```

### Site naming

`gazetta init` creates `sites/main/` by default. The name "main" has no special meaning —
the developer can rename it to anything. Auto-detection uses "only one directory in `sites/`"
regardless of name. For multi-site, names are chosen by the developer.

### Multi-site republishing

Templates are shared across sites. If a template changes, all sites using it may need
republishing. `gazetta publish` publishes one site at a time. To republish all sites:

```
gazetta publish production my-site
gazetta publish production another-site
```

Future: `gazetta publish --all` to publish all sites in one command.

### Admin API template discovery

The admin API needs access to the project root (for `templates/`) and the site dir (for
`sites/my-site/`). `gazetta dev` passes both paths when creating the admin API. The API's
`GET /api/templates` reads from `{projectRoot}/templates/`, not from the site dir.

### `gazetta build` skips targets without workers

`build` generates worker code only for targets that have `worker` config. Static targets
and `publishMode: esi` targets (without worker) are skipped — no worker to build.

### Consistent positional arguments

All commands that take a target use positional args:

```
gazetta publish production        # positional target
gazetta deploy production         # positional target
gazetta serve production          # positional target (not --target)
```

### Gazetta version across workspaces

Both `admin/package.json` and `templates/package.json` list `gazetta` as a dependency.
They should use the same version range. npm workspaces deduplicates to one copy at the
project root. Pin the range in both: `"gazetta": "^1.0.0"`.

### React peer dependency for template-only projects

`gazetta` has `peerDependencies: { react, react-dom }`. Templates that don't use React
(Svelte, Vue, plain TS) will see a peer dep warning on install. This is acceptable —
the warning is informational, not a failure. The peer dep is required for the editor
(which uses React for @rjsf), even if templates don't.

### Error messages for invalid arguments

CLI shows helpful errors when arguments don't match:

```
gazetta publish productoin
> Error: target "productoin" not found in site.yaml.
> Available targets: staging, production
```

### `gazetta init` in existing directory

`gazetta init .` in a non-empty directory errors if conflicting files exist (package.json,
templates/, etc.). Safe to run in a directory with only `.git` or unrelated files.
`gazetta init my-site` always creates a new directory — errors if it already exists.

### Template hot reload

During `gazetta dev`, file watcher detects changes:
- **Template `.ts`/`.tsx` change** → invalidates template cache, triggers SSE reload. Preview
  refreshes automatically. No server restart needed (jiti hot-reloads the module).
- **Content YAML change** → triggers SSE reload. Preview refreshes.
- **Custom editor/field change** → Vite HMR updates the editor in-place (no page refresh).

### Incremental publish

`gazetta publish` currently renders ALL pages and fragments on every run. For large sites
(100+ pages), this is slow. Future: incremental publish that tracks which templates/content
changed and only re-renders affected pages. For now, full publish is the only mode.

### TypeScript configuration

`gazetta init` creates `tsconfig.json` at the project root covering `admin/` with `@templates`
paths alias. Templates have their own `tsconfig.json` inside `templates/` with appropriate
compiler options (jsx, strict, etc.). Two tsconfigs — one per compilation context (browser vs server).

### `dist/` is never committed

`dist/` is in `.gitignore`. After `git clone`, the developer must run `gazetta build` to
regenerate it. The self-hosting workflow (above) includes this step. CI/CD pipelines should
also run `build` before `deploy`.

### Files created by `gazetta init`

Init creates:

```
my-site/
  package.json             # see below
  .gitignore               # node_modules/, dist/, .env.local
  .env                     # empty, with comments for common vars
  tsconfig.json            # paths: { "@templates/*": ["./templates/*"] }
  admin/
    package.json           # { name: "admin", ... }
    tsconfig.json          # jsx, strict, browser target
  templates/
    package.json           # { name: "templates", ... }
    tsconfig.json          # jsx, strict, node target
  sites/main/
    site.yaml
    ...
```

Root `package.json`:
```json
{
  "name": "my-site",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "workspaces": ["admin", "templates"],
  "scripts": {
    "dev": "gazetta dev",
    "publish": "gazetta publish",
    "build": "gazetta build"
  }
}
```

Workspace names are `"admin"` and `"templates"` (short, no scope). `private: true`
on all three prevents accidental npm publish.

### Running from subdirectories

`gazetta dev` (and other commands) can run from any subdirectory within the project.
The CLI walks up from the current directory to find the project root (see project root
detection above). `gazetta dev` from `templates/hero/` works the same as from the root.

### Node.js version

`gazetta init` adds `engines: { "node": ">=22" }` to root `package.json`. `gazetta dev`
checks the Node version on startup and errors if too old:

```
gazetta dev
> Error: Gazetta requires Node.js 22 or later. Current: 18.19.0
```

### Missing `npm install`

If `node_modules/` doesn't exist, `gazetta dev` errors immediately:

```
gazetta dev
> Error: node_modules not found. Run `npm install` first.
```

### `gazetta build` idempotency

`build` cleans `dist/` before building. Running it twice produces identical output.
Stale files from previous builds are removed. `dist/` is always a fresh, complete output.

### Deploy credentials

`gazetta deploy production` needs platform credentials separate from storage credentials:

| Platform | Credential source | How |
|----------|------------------|-----|
| Cloudflare | `wrangler login` (interactive) or `CLOUDFLARE_API_TOKEN` env var | wrangler handles auth |
| Deno Deploy (future) | `DENO_DEPLOY_TOKEN` env var | — |
| Vercel (future) | `VERCEL_TOKEN` env var | — |

Deploy credentials go in `.env` or CI secrets. They are NOT in `site.yaml` (which holds
storage credentials). Deploy is a one-time setup — credentials are rarely needed after initial deploy.

### Dev playground empty state

If no custom editors or fields exist, the playground shows:

```
No custom editors or fields yet.

Create an editor:  admin/editors/{template-name}.tsx
Create a field:    admin/fields/{field-name}.tsx

See docs: gazetta.studio/docs/custom-editors
```

The playground also shows the default @rjsf form for any template — useful for testing
schemas without creating a custom editor.

### Gazetta version upgrades

No migration tooling exists. When upgrading gazetta (e.g. `1.x → 2.x`), developers update
the version in `admin/package.json` and `templates/package.json`, run `npm install`, and check
for breaking changes. `gazetta validate` should detect incompatibilities (future). Breaking changes
documented in CHANGELOG per release.

### Multiple developers, same project

Each developer runs their own `gazetta dev` on a different port:

```
gazetta dev -p 3000       # developer A
gazetta dev -p 3001       # developer B
```

Content changes (YAML) may conflict in git — standard merge conflict resolution applies.
No collaborative real-time editing (each dev has their own server).

### Git and content authoring

Content (YAML in `sites/`) is committed to git. The admin UI writes to the local filesystem.
Content authors must commit their changes manually (or via a git hook). No auto-commit —
the developer controls when changes are committed. Git conflicts in YAML are resolved like
any other merge conflict.

### Concurrent publish safety

`gazetta publish` and admin UI publish (`POST /api/publish`) can run concurrently without
corruption — each renders independently and uploads to the same storage. Last write wins.
For team workflows, publish from CI (on merge to main) is the recommended pattern — avoids
conflicting manual publishes.

### Sites without `site.yaml`

A directory in `sites/` without `site.yaml` is ignored by auto-detection. Not an error.
`gazetta dev` and `publish` only recognize directories that contain `site.yaml`.

### `gazetta dev` without targets

Works. Dev mode renders on-the-fly from source and doesn't need targets. The admin UI's
Publish button is disabled if no targets are configured. `gazetta publish` errors:
"No targets configured in site.yaml."

### HTTPS in dev mode

`gazetta dev` serves over HTTP. For browser APIs requiring HTTPS (clipboard, geolocation),
use a reverse proxy (e.g. `caddy reverse-proxy --from https://localhost:3443 --to localhost:3000`).
Future: `--https` flag using a self-signed cert.

### Static assets (images, fonts, CSS)

Static assets (images, videos, fonts, CSS files) live in `sites/my-site/public/`. During
`gazetta dev`, they're served at the root URL. During `gazetta publish`, they're uploaded
alongside rendered pages. Templates reference them with absolute paths (`/images/hero.jpg`).

Content authors add images via URL in the CMS editor (image field widget). For uploaded
files, a future asset management system will handle uploads to target storage.

### Template errors during publish

`gazetta publish` renders all pages. If a template throws during SSR:
- The error is logged with the page name and template
- The page is skipped — not uploaded
- Publishing continues with remaining pages
- Exit code is non-zero if any page failed
- Summary at the end: "Published 48/50 pages. 2 failed."

### Fragment dependency tracking

For ESI mode: fragments are stored independently. The runtime assembles them on request.
No dependency tracking needed — changing a fragment and republishing it updates all pages
instantly (the runtime fetches the latest version).

For static mode: pages bake fragments inline. `gazetta publish` re-renders ALL pages by
default (no dependency tracking). Future: dependency graph that tracks which pages use
which fragments, enabling incremental publish for static mode.

### Site-specific configuration

`site.yaml` supports site-level settings beyond name and targets:

```yaml
name: My Site
locale: en
baseUrl: https://mysite.com
systemPages:
  - 404
targets:
  production: ...
```

Custom site-level settings can be added as top-level fields — accessible to templates via
the render context. Not currently validated — future schema for site.yaml.

### CLI exit codes

All CLI commands use standard exit codes:
- `0` — success
- `1` — error (validation failures, publish errors, missing config)
- Non-zero exit is critical for CI pipelines.

### Publish storage layout

`gazetta publish` uploads to target storage with this layout:

```
# ESI mode:
pages/{name}.json           # page manifest (route, components, metadata)
pages/{name}/*.html         # pre-rendered component HTML
fragments/{name}/*.html     # pre-rendered fragment HTML
site.json                   # site manifest
fragment-index.json         # fragment → pages dependency map

# Static mode:
pages/{route}/index.html    # fully assembled HTML per route
```

### Deleting a site

Delete the `sites/{name}/` directory. Published content in the target storage is NOT
automatically removed — it remains as orphaned files. Future: `gazetta clean [target]`
command to remove published content for a deleted site from storage.

### Renaming templates

Renaming a template (e.g. `hero` → `banner-hero`) requires updating:
1. Template directory: `templates/hero/` → `templates/banner-hero/`
2. All YAML references: `template: hero` → `template: banner-hero`
3. Custom editor: `admin/editors/hero.tsx` → `admin/editors/banner-hero.tsx`
4. Type imports: `from '@templates/hero'` → `from '@templates/banner-hero'`

`gazetta validate` catches broken references after the rename. No automated rename
command (future: `gazetta rename template hero banner-hero`).

### Schema changes and content compatibility

If a template's schema changes (new required field, type change), existing content may
not satisfy the new schema. `gazetta validate` should check content against template
schemas — reporting which pages/fragments have incompatible content.

During `gazetta dev`, preview shows an error overlay for schema mismatches.
During `gazetta publish`, pages with invalid content are skipped (same as template errors).

### Partial publish from CLI

`gazetta publish` renders all pages by default. To publish a single page:

```
gazetta publish production --page home
gazetta publish production --fragment header
```

Useful for fixing one page without re-rendering the entire site. The admin UI already
supports per-page publish via the Publish button.

### Content recovery from storage

ESI targets store page/fragment manifests (JSON) — content is recoverable via
`gazetta fetch` (pulls manifests back from storage into local YAML files).
Static targets store rendered HTML — source content is lost. Recovery not possible.

Content is also in git (YAML files in `sites/`). Git is the primary backup mechanism.

### Accidental publish to production from dev

`gazetta dev` allows publishing to any configured target, including production. First
publish to a non-filesystem target shows a confirmation prompt:

```
gazetta dev
> [Admin UI] Publishing to "production" (r2://my-site)
> ⚠ This will update live content. Continue? [y/N]
```

CI (`CI=true`) skips the prompt. Future: target-level `confirm: true` flag in site.yaml.

### Storage upload behavior

| Provider | Upload mode | Concurrency | Retry | Rate limits |
|----------|-----------|-------------|-------|-------------|
| Filesystem | Sequential | 1 | No | N/A |
| R2 (REST) | Sequential | 1 | No | N/A |
| R2 (S3 API) | Parallel | 10 | Yes (3 retries) | 1000 req/s |
| S3 | Parallel | 10 | Yes (3 retries) | 3500 PUT/s |
| Azure Blob | Parallel | 10 | Yes (3 retries) | 20000 req/s |

Parallel upload with concurrency of 10 is the default for cloud providers. Filesystem
and R2 REST are sequential due to API constraints.

### Credential validation

`gazetta validate --target production` checks storage credentials by attempting a
small read operation (e.g. listing the root directory). Reports clear error if
credentials are expired, invalid, or missing.

### Migration from flat to new structure

Existing sites (flat structure) continue to work — the CLI detects the structure by
checking for `admin/` and `templates/` directories. If not found, it falls back to the
current flat behavior (templates and content in the same directory).

Migration is manual: create `admin/`, `templates/`, `sites/main/`, move files. Future:
`gazetta migrate` command to automate this.

### Editor/field file extensions

Editors and fields can be `.ts`, `.tsx`, `.jsx`. Vite transforms all of them. While the
EditorMount/FieldMount contracts are framework-agnostic, editors that import `createEditorMount`
or `DefaultEditorForm` use React. Vanilla JS/TS editors (no React import) are also supported —
they use DOM APIs directly.

### Internationalization (i18n)

Multi-language sites use separate pages per locale:

```
sites/my-site/
  pages/
    home/page.yaml           # English (default)
    fr/home/page.yaml        # French
    de/home/page.yaml        # German
```

Each locale is a separate page with its own content and route (`/`, `/fr/`, `/de/`).
Templates are shared — the same `hero` template renders English or French content
depending on what's in `page.yaml`. No built-in translation framework — content is
managed per-page.

`site.yaml` `locale` field sets the default locale for metadata (lang attribute, etc.).

### Template and editor testing

Templates have their own `package.json` — add test scripts:

```json
// templates/package.json
{ "scripts": { "test": "vitest run" } }
```

Template tests: import the render function, call it with mock content, assert HTML output.
Editor tests: mount the EditorMount into a DOM element (jsdom), simulate onChange.
`gazetta init` scaffolds a basic test setup in `templates/package.json`.

### Preview accuracy

`gazetta dev` renders on-the-fly using the same renderer as `gazetta publish`. Output
should be identical. Exception: templates using non-deterministic values (`Date.now()`,
`Math.random()`) will produce different output between dev preview and published content.
Templates should avoid non-deterministic rendering for consistency.

### Startup performance

`gazetta dev` loads templates lazily — only when a page is first requested. File watcher
registers all template files but doesn't import them. Startup is fast regardless of
template count. First request to each page has a cold-start delay (~50-200ms for jiti import).

### `gazetta serve` — editing vs published content

`gazetta serve` shows published content from storage — not local filesystem edits. The admin
UI in `serve` mode publishes directly to the target storage. Edits are immediately live
(after publish). This is different from `dev` mode where edits are local and preview is
on-the-fly. In `serve` mode, there is no local draft state — publish = live.

## Known Gaps

Summary of configuration gaps and inconsistencies. Reference this when working on publish,
targets, or CLI commands to avoid re-introducing these issues or building on broken assumptions.

| # | Gap | Severity | Location | Status |
|---|-----|----------|----------|--------|
| 1 | Admin API always publishes ESI, ignores static mode | Critical | `admin-api/routes/publish.ts` | Bug — CLI and admin UI produce different output for static targets |
| 2 | Publish mode coupled to worker config — needs `publishMode` field | High | `cli/index.ts` | Design — add `publishMode: esi | static` to target config to decouple from worker |
| 3 | Cache purge only implements Cloudflare | Medium | `cli/index.ts`, `admin-api/routes/publish.ts` | Silent no-op for S3/Azure purge configs |
| 4 | `WorkerConfig.type` is `string`, only `'cloudflare'` works | Low | `types.ts` | Should be literal type |
| 5 | `validate` doesn't check targets | Medium | `cli/index.ts` | No storage connectivity, env var, or credential checks |
| 6 | `fetch` can't recover from static targets | Medium | `admin-api/routes/publish.ts` | Static targets have rendered HTML, not source manifests |
| 7 | No validation of nonsensical target combos | Low | `targets.ts` | R2+no worker, filesystem+worker silently accepted |
| 8 | Project structure doesn't match doc | High | `examples/starter/`, `sites/` | Current starter is flat — needs restructuring to `admin/`, `templates/`, `sites/` |
| 9 | React is direct dep, not peer dep | Medium | `packages/gazetta/package.json` | Should be peerDependency so site controls version |

## Data Flow Summary

```
                    ┌──────────────┐
                    │  Developer   │
                    │  (templates) │
                    └──────┬───────┘
                           │ creates
                    ┌──────▼───────┐
  gazetta init ──►  │   Project    │  ◄── content author (admin UI)
                    │  templates/  │
                    │  admin/      │
                    │  sites/      │
                    └──────┬───────┘
                           │
         ┌─────────────────┼──────────────────┐
         │                 │                  │
  gazetta dev       gazetta publish    gazetta build
  (on-the-fly)      (render + push)    (admin + worker)
         │                 │                  │
         │          ┌──────▼──────┐    gazetta deploy
         │          │  Renderer   │    (worker to edge)
         │          │ (SSR + ESI) │           │
         │          └──────┬──────┘           │
         │                 │                  │
         │          ┌──────▼──────────────────▼──┐
         │          │          Targets            │
         │          │  ┌─────────┐ ┌───────────┐ │
         │          │  │ Storage │ │Worker/Srvr│ │
         │          │  └─────────┘ └───────────┘ │
         │          └────────────────────────────┘
         │                       │
         │                ┌──────▼──────┐
         └──────────────► │   Browser   │
                          └─────────────┘
```
