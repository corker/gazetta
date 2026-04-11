# Configurations

How Gazetta is developed, configured, and deployed. Use this to reason about which
code paths, storage providers, publish modes, and CLI commands apply to a given scenario.

## Development Modes

| Mode | Who | What they run | What they edit |
|------|-----|---------------|----------------|
| **Gazetta contributor** | Core developer | `npm run dev` from monorepo root (builds core, starts starter) | `packages/gazetta/`, `apps/admin/` |
| **Site author (new)** | End user | `npx gazetta init my-site && npx gazetta dev` | `templates/`, `fragments/`, `pages/`, `site.yaml` |
| **Site author (existing)** | End user | `npx gazetta dev` in site dir | Same as above |
| **Template developer** | Frontend dev | `npx gazetta dev` — builds/tests templates in a site context | `templates/` only (schema, render fn, custom editor) |
| **Admin UI developer** | Core developer | `npm run dev` from `apps/admin/` (Vite UI :3000 + Hono API :4000) | `apps/admin/src/client/`, `apps/admin/src/server/` |

The monorepo `npm run dev` starts `examples/starter` which has both filesystem and Azure Blob
targets configured — exercises most code paths locally.

## Site Topology

| Setup | Structure | site.yaml targets | Use case |
|-------|-----------|-------------------|----------|
| **Single site** | Standalone dir or monorepo `sites/my-site/` | 1+ targets | Most sites |
| **Multi-site monorepo** | Multiple dirs under `sites/` sharing templates | Each site has own `site.yaml` | Agency, multi-brand |

Multi-site: each site is independent. CLI operates on one site at a time (`gazetta publish sites/site-a`).
Shared templates must be copied or symlinked — no cross-site template resolution.

## File Structures

### Gazetta monorepo (contributor / core developer)

```
gazetta/
  package.json                 # workspaces: ["packages/*", "apps/*", "examples/*", "sites/*"]
  packages/
    gazetta/                   # Core package — renderer, CLI, admin API, editor, storage providers
      src/
        cli/                   # CLI commands (dev, publish, serve, deploy, validate)
        admin-api/             # Hono API routes (pages, fragments, templates, preview, publish)
        editor/                # Default editor — @rjsf form, Tiptap, custom widgets
        types.ts               # EditorMount, FieldMount, TemplateModule, etc.
      package.json             # peerDependencies: { react, react-dom }
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
  package.json                 # workspaces: ["admin", "templates", "sites/*"]
  admin/                       # Custom editors + fields (browser, CMS-aligned) — workspace
    package.json               # deps: { gazetta, react, react-dom, @radix-ui, ... }
    editors/                   # Custom editors (per-template full replacements)
      hero.tsx                 # EditorMount for templates/hero
    fields/                    # Custom fields (reusable widgets)
      brand-color.tsx          # FieldMount — referenced in schemas as { field: 'brand-color' }
  templates/                   # Template render functions + schemas (server) — workspace
    package.json               # deps: { react, svelte, zod, ... }
    hero/
      index.tsx                # render fn + Zod schema
    card/
      index.ts
    nav/
      index.svelte             # non-React template, no conflict
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
| Template (render + schema) | Project | Server (Node) | Shared (workspace) | `templates/` |
| Editor (custom editing UI) | Project | Browser (admin) | Admin UI (same React) | `admin/editors/` |
| Field (custom widget) | Project | Browser (admin, inside @rjsf) | Admin UI (same React) | `admin/fields/` |
| Fragment | Site | Server (rendered) | Templates | `sites/x/fragments/` |
| Page | Site | Server (rendered) | Templates | `sites/x/pages/` |

Templates, editors, and fields are shared across all sites in the project. Fragments and pages are per-site.

Editors are conceptually 1:1 with templates but dependency-coupled to the admin. `admin/editors/hero.tsx` is the editor for `templates/hero/` — connected by name, not file path.

**Dependencies:**
- All three (`admin/`, `templates/`, `sites/*`) are npm workspaces — **one `npm install`** at the project root.
- By default, templates share the project's React version. Non-React templates (Svelte, Vue, plain TS) don't conflict.
- Edge case: if templates need a different React version, remove `templates` from workspaces and run `cd templates && npm install` separately (or use pnpm which handles version isolation natively).

**Install:**
```
cd my-project && npm install    # everything — admin, templates, sites
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

A target = storage + optional worker + optional cache. The worker config determines the publish mode.

| Target type | Worker config | Publish mode | Serve mode | Fragment updates |
|-------------|--------------|--------------|------------|-----------------|
| **Edge (Cloudflare)** | `worker: { type: cloudflare }` | ESI — pages have `<!--esi:-->` placeholders, fragments stored separately | Cloudflare Worker assembles at edge | Instant — republish fragment only |
| **Self-hosted server** | No worker, use `gazetta serve` | ESI — same as edge | Node/Bun Hono server assembles at request time | Instant — republish fragment only |
| **Static hosting** | No worker, no server | Static — pages fully assembled, fragments baked in | GitHub Pages / Netlify / S3 / any file server | Requires republishing all pages using that fragment |

Decision logic in code (`cli/index.ts:283`): `const isStatic = !targetConfig?.worker`

**Known gaps:**

- **Publish mode is coupled to worker config.** `gazetta serve` targets need `worker: { type: cloudflare }`
  to get ESI mode during publish, even though `gazetta serve` itself doesn't use the worker.
  Without it, the "no worker" path always produces fully-baked static HTML. Consider adding a
  `publishMode: esi | static` field or a `serve` worker type to decouple this.

- **Admin API always publishes ESI mode** (`admin-api/routes/publish.ts`). It calls
  `publishPageRendered()` / `publishFragmentRendered()` regardless of worker config. CLI branches
  correctly. This means CLI and admin UI produce different output for static targets. Fix: admin API
  must check `!targetConfig?.worker` and branch like the CLI does.

- **`gazetta serve` against static-published targets works by accident.** Static pages have no ESI
  placeholders, so ESI assembly is a no-op. But the intent is wrong — serve expects ESI content.
  If a target is meant for `gazetta serve`, it must have worker config to trigger ESI publish.

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
  worker: { type: cloudflare }  # needed for ESI publish mode, even with gazetta serve
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
| **CLI** | `gazetta publish [-t target]` | Developer machine or CI | Full site publish |
| **Admin UI** | Publish button → `POST /api/publish` | Browser → dev server API | Per-page/fragment publish during editing |
| **CI/CD** | `npx gazetta publish` in GitHub Actions | CI runner | Automated publish on push |

CLI and CI use the same publish functions and branch on `!targetConfig?.worker` to choose
static vs ESI mode. The admin API resolves dependencies (fragments required by a page)
and handles per-item cache purge, but **always uses ESI mode** — does not branch on worker
config (see gap in Target Configurations above).

### CI/CD pattern (GitHub Actions)

```yaml
- npm ci && npm run build
- npx tsx packages/gazetta/src/cli/index.ts publish sites/my-site
  env: { CLOUDFLARE_API_TOKEN, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY }
- cd sites/my-site/worker && npx wrangler deploy  # if using Cloudflare Worker
```

## Serve Modes

| Mode | Command | Runtime | What it does |
|------|---------|---------|-------------|
| **Dev server** | `gazetta dev` | Node (Hono) | Renders on-the-fly from source, hot reload via SSE, admin UI at /admin |
| **Node production** | `gazetta serve [-t target] [-p port]` | Node/Bun (Hono) | ESI assembly from storage, ETag/304, Cache-Control headers |
| **Cloudflare Worker** | `gazetta deploy -t target` (one-time) | Cloudflare Workers (Hono) | ESI assembly from R2, Cache API, edge distribution |
| **Static file server** | Any web server (nginx, Caddy, etc.) | None | Serves pre-baked HTML files directly |

`gazetta dev` and `gazetta serve` are different code paths:
- `dev` uses the renderer directly, watches files, supports admin UI
- `serve` reads pre-rendered HTML from storage and assembles ESI

## CLI Commands

| Command | Purpose | Key code path |
|---------|---------|---------------|
| `gazetta init [dir]` | Scaffold new site | Writes template files to disk. **No targets in site.yaml** — user must add manually |
| `gazetta dev [site-dir]` | Dev server + CMS | `cli/index.ts` → renderer + admin-api + SSE watcher |
| `gazetta publish [site-dir]` | Pre-render and upload | `publish-rendered.ts` → storage provider |
| `gazetta serve [site-dir]` | Production Node server | `serve.ts` → ESI assembly from storage |
| `gazetta deploy -t <name>` | Deploy Cloudflare Worker | Generates worker, runs `wrangler deploy` |
| `gazetta validate [site-dir]` | Check broken references | Validates templates, fragments, pages. **Does not check** target connectivity, env vars, or storage access |

## Known Gaps

Summary of configuration gaps and inconsistencies. Reference this when working on publish,
targets, or CLI commands to avoid re-introducing these issues or building on broken assumptions.

| # | Gap | Severity | Location | Status |
|---|-----|----------|----------|--------|
| 1 | Admin API always publishes ESI, ignores static mode | Critical | `admin-api/routes/publish.ts` | Bug — CLI and admin UI produce different output for static targets |
| 2 | Publish mode coupled to worker config | High | `cli/index.ts:283` | Design — `gazetta serve` needs fake `worker` config for ESI |
| 3 | `gazetta init` scaffolds no targets | Medium | `cli/index.ts:78-218` | UX — new users must manually add targets before publish works |
| 4 | Cache purge only implements Cloudflare | Medium | `cli/index.ts`, `admin-api/routes/publish.ts` | Silent no-op for S3/Azure purge configs |
| 5 | `WorkerConfig.type` is `string`, only `'cloudflare'` works | Low | `types.ts:79` | Should be literal type |
| 6 | `validate` doesn't check targets | Medium | `cli/index.ts:464-528` | No storage connectivity, env var, or credential checks |
| 7 | `fetch` can't recover from static targets | Medium | `admin-api/routes/publish.ts:136-187` | Static targets have rendered HTML, not source manifests |
| 8 | No validation of nonsensical target combos | Low | `targets.ts` | R2+no worker, filesystem+worker silently accepted |

## Data Flow Summary

```
                    ┌──────────────┐
                    │  Developer   │
                    │  (templates) │
                    └──────┬───────┘
                           │ creates
                    ┌──────▼───────┐
  gazetta init ──►  │    Site      │  ◄── content author (admin UI)
                    │  (filesystem)│
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
       gazetta dev    gazetta publish   POST /api/publish
       (on-the-fly)   (CLI / CI)       (admin UI)
              │            │            │
              │     ┌──────▼──────┐     │
              │     │  Renderer   │◄────┘
              │     │ (SSR + ESI) │
              │     └──────┬──────┘
              │            │
              │     ┌──────▼──────────────────────────┐
              │     │           Targets                │
              │     │  ┌─────────┐  ┌──────────────┐  │
              │     │  │ Storage │  │ Worker/Server │  │
              │     │  │(R2/S3/..)│ │(CF/Node/none)│  │
              │     │  └─────────┘  └──────────────┘  │
              │     └─────────────────────────────────┘
              │                     │
              │              ┌──────▼──────┐
              └──────────►   │   Browser   │
                             └─────────────┘
```
