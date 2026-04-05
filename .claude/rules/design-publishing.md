# Publishing Model

Gazetta's CMS is stateless. All content state lives in targets.

## Stateless CMS

The CMS stores nothing. It:
1. Fetches structure/pages/fragments from a target
2. User edits in the browser (in memory)
3. Publishes changes back to one or more targets

Consequence: the CMS is disposable. Lose it, spin up a new one, connect to targets.

## Targets

A target is any node that holds a full copy of the site structure.
Each target independently stores templates, fragments, pages, and manifests.

```
target: production
  site.yaml
  templates/
  fragments/
  pages/

target: staging
  site.yaml
  templates/
  fragments/
  pages/
```

Targets can diverge — staging may have changes not yet in production.

## Operations

| Operation | Flow | Description |
|-----------|------|-------------|
| Publish | CMS -> target | Push components/pages/fragments to a target |
| Fetch | CMS <- target | Pull from a target into the editor |
| Promote | Target A -> Target B | Copy between targets (e.g. staging -> production) |
| Compare | Target A <-> Target B | Diff two targets to see what changed |

## Target Types

Targets come in two flavors depending on whether the site needs server-side dynamic components:

| Target type | Runtime | Serves | Use case |
|-------------|---------|--------|----------|
| **Static** | Edge (Hono on Workers/Deno) | Pre-rendered HTML assembled at request time | Marketing sites, blogs, docs |
| **Dynamic** | Node/Bun server (Hono) | Mix of pre-rendered + SSR'd per request | Apps needing fresh data from DB/API |

Both types use Hono. Both store components in storage. The difference is whether
SSR happens at publish time (static) or request time (dynamic).

### Static target

```
Publish:   CMS → SSR (Node/Bun) → pre-rendered HTML → push to storage
Request:   Browser → Edge → fetch pre-rendered fragments → assemble page → serve
```

### Dynamic target

```
Publish:   CMS → push component source + pre-rendered static components → storage
Request:   Browser → Node/Bun → static from cache, dynamic SSR'd fresh → assemble → serve
```

## Publishing

You can publish a page or a fragment. No full-site rebuilds.

| Publish | Static target | Dynamic target |
|---------|--------------|----------------|
| A page | CMS SSR's the page's local components, pushes HTML to storage | Pushes source to storage |
| A fragment | CMS SSR's the fragment, pushes HTML to storage. All pages using `@fragment` instantly updated on next request. | Pushes source. Fragment SSR'd fresh per request. |

In both cases, publishing a shared fragment updates all pages that use it — no need to
re-render or re-publish other pages. The runtime (edge or server) composes at request time.

## Bidirectional Sync

The CMS can pull from any target. Use cases:
- Hotfix applied directly to production? Fetch it back
- Bootstrap a new CMS instance from an existing target
- Migrate between hosts: fetch from old target, publish to new

## Storage Providers

Storage is a simple read/write file interface. Adapters handle specifics:

| Provider | Example |
|----------|---------|
| Filesystem | Local folder |
| S3 / Cloud storage | AWS S3, GCS, Azure Blob |
| Git repository | GitHub, GitLab |
| FTP/SFTP | Legacy hosting |

## Runtime

Built on **Hono** — runs on both edge (Cloudflare Workers, Deno) and server (Node, Bun).

### Static target runtime (edge)
1. Receives page request
2. Fetches page manifest from storage
3. Resolves `@` references to fragments
4. Fetches pre-rendered HTML for each component from storage
5. Assembles into complete HTML document (string concatenation, no SSR)
6. For islands: injects hydration script + per-page import map
7. Serves the response

### Dynamic target runtime (Node/Bun server)
1. Receives page request
2. Fetches page manifest from storage
3. Resolves `@` references to fragments
4. Static components: fetched pre-rendered from cache/storage
5. Dynamic components: SSR'd fresh (executes template with React/Vue/Svelte)
6. Islands: SSR'd + hydration script injected
7. Assembles + serves

### Component rendering types

| Type | Rendered | JS to browser | Use case |
|------|---------|---------------|----------|
| **Static** | Pre-rendered at publish time | Zero | Content that rarely changes |
| **Dynamic** | SSR'd at request time (Node/Bun) | Zero | Fresh data from DB/API |
| **Island** | SSR'd + hydrated in browser | Framework + component | Client-side interactivity |

Import maps deduplicate island dependencies per page.
