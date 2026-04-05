# Design Decisions

Key decisions and their rationale. Each entry: decision, why, and what was rejected.

## 1. Stateless CMS — all state in targets

**Decision:** The CMS holds no persistent state. Targets are the only source of truth.

**Why:** Traditional CMSes couple authoring and storage. If the CMS dies, content is lost or locked.
A stateless CMS is disposable, horizontally scalable, and avoids database maintenance.

**Rejected:** Local database (adds ops burden), local filesystem state (creates sync problems).

## 2. Component/Fragment/Page naming hierarchy

**Decision:** Three levels of naming:
- **Component** — the general building block (has template, content, optional children)
- **Fragment** — a shared component, reusable across pages (lives in `fragments/`, referenced with `@`)
- **Page** — a component with route and metadata (lives in `pages/`)

**Why:** Components are the universal primitive. Fragments are the SSI-inspired concept of shared
pieces composed at serve time. Pages are routable entry points. This maps naturally to web standards
(components), server-side composition (fragments/includes), and URL routing (pages).

**Rejected:** "Fragment" as the universal term (no distinction between shared and local),
"include" for shared components (confusing, describes mechanism not thing),
"block"/"widget"/"module" (overloaded or too narrow).

## 3. Filesystem structure mirrors site structure

**Decision:** Folders and files define the site tree. A folder is a composite, a file is a leaf.

**Why:** The structure is visible, versionable (git), and editable without the CMS.
No proprietary format or database schema to learn.

**Existing art:** Hugo/Astro map folders to pages. Gazetta extends this to sub-page components.
Storyblok/Contentful support nested components but only in a database, not as files.

## 4. Manifests for ordering (not convention)

**Decision:** `page.yaml` and `fragment.yaml` define component order explicitly.

**Why:** Convention-based ordering (alphabetical, numbered prefixes) is fragile and hard to
reorder without renaming files. A manifest is a single source of truth that a UI can edit.

**Rejected:** Numbered prefixes (`01-header`), alphabetical order, inline HTML imports.

## 5. Bidirectional sync between CMS and targets

**Decision:** The CMS can both push to and pull from targets.

**Why:** One-directional publish creates a single point of failure. Bidirectional sync enables:
- Recovery from CMS loss (fetch from production)
- Pulling hotfixes back from production
- Bootstrapping new CMS instances
- Migration between hosting providers

**Existing art:** No known CMS supports this. TinaCMS/Decap sync with Git repos but not deploy targets.

## 6. Multiple independent targets

**Decision:** Each target holds a full, independent copy of the site structure.

**Why:** Different environments (staging, production) need different content states.
Publishing means targets can intentionally diverge.
Promotion (staging -> production) is an explicit operation, not automatic.

**Rejected:** Single output destination, build-then-deploy pipeline.

## 7. Edge runtime for page composition (WinterTC)

**Decision:** Pages are composed from components at request time by a WinterTC-compatible edge runtime,
not pre-rendered into static HTML files.

**Why:** Every site has shared fragments (header, footer, nav). Publishing a fragment must update
all pages instantly without re-rendering and re-uploading every page. Pre-rendering to static files
would mean a full rebuild on every shared fragment change. The edge runtime composes on request, so
publishing a fragment = pushing one file.

The same runtime runs locally in the CMS for preview — one composition logic everywhere.

**Researched alternatives:**
- Static files + client-side includes: no SEO (crawlers don't execute JS)
- Static files + hybrid (pre-rendered + client swap): still requires re-publishing all pages
- Service Workers: not installed on first visit, no SEO
- ESI (Edge Side Includes): not portable (only Varnish/Akamai)
- WinterTC edge function: portable (Cloudflare Workers, Deno Deploy, Vercel Edge), SSR, SEO-safe

**Rejected:** Pre-rendered static HTML (requires full rebuild on shared fragment change),
client-side composition (no SEO), provider-specific edge includes (not portable).

## 8. Hono as the runtime foundation

**Decision:** The runtime is built on Hono, a WinterTC-native HTTP framework.

**Why:** Our core requirement — composing pages from independently stored, independently updated,
multi-framework components at request time — is incompatible with every existing framework.
Astro, Next.js, SvelteKit, Remix, Nuxt, Fresh all assume build-time component knowledge.
None can compose from components stored in external storage at request time.

Hono is WinterTC-native (runs on Cloudflare Workers, Deno, Bun, Node), mature (v4.7+, 22k+ stars),
and is a library — not a full framework. We build our composition engine on top.

**Researched alternatives:**
- Astro: closest conceptually (islands, Server Islands, multi-framework) but compiler-centric, cannot compose dynamically
- Next.js: RSC could compose dynamically in theory, but React-only, Node-dependent, not WinterTC
- Vike: closer to a library, but single-framework per project, no islands
- Fresh: islands architecture but Preact-only, Deno-only
- SvelteKit/Nuxt: single-framework, build-time components

**Rejected:** All full frameworks (require build-time component knowledge).

## 9. Templates as independent scripts with any framework

**Decision:** Each template is a self-contained package with its own dependencies.
Can use React, Svelte, Vue, plain TS — any framework that can SSR to `{ html, css, js }`.

**Why:** Developers should use the tools they know. The template contract `(params) => { html, css, js }`
is the boundary. Framework choice is per-template, not per-project.

**Rejected:** Single framework mandate, proprietary template language, plain tagged templates only.

## 10. Islands architecture with import maps for dependency deduplication

**Decision:** Dynamic components are islands — SSR'd with a placeholder, hydrated client-side.
Per-page import maps deduplicate shared dependencies across islands.

**Why:** Pages mix static and dynamic components. Static components ship zero JS. Dynamic components
(search, charts, interactive widgets) need client-side JS. Import maps are a native browser feature
that prevents shipping React (or any framework) multiple times when multiple islands use it.

The runtime generates the import map per page based on which components are present — each page
only loads the frameworks it actually needs.

**Rejected:** Bundling deps per-island (duplicates frameworks), global bundle (ships unused JS),
CDN externals (external dependency).

## 11. JSON Schema for content schemas, @rjsf for form generation

**Decision:** Component content is described by JSON Schema. The CMS auto-generates editor
forms using @rjsf/core (react-jsonschema-form). Templates can declare schemas in YAML
(as JSON Schema) or in code (as Zod, converted via zod-to-json-schema).

**Why:** JSON Schema is a standard — validators, form generators, and documentation tools all
support it. @rjsf has 882K weekly downloads, supports shadcn theming, custom widgets, and
uiSchema for layout control. Covers 90% of editing needs without custom code.

**Researched alternatives:**
- @jsonforms/react: powerful renderer system but more boilerplate per custom field
- @autoform/zod: generates forms from Zod directly, but young (13K downloads)
- Custom form builder: maximum control but enormous effort

**Rejected:** Custom-only editors (too much work per template), no schema (no validation, no auto-generation).

## 12. Mount function for framework-agnostic custom editors

**Decision:** Custom editors use the single-spa micro-frontend lifecycle pattern:
`mount(el, { content, onChange })` / `unmount(el)`. Any framework can implement this.

**Why:** Templates can use any framework for rendering — editors should have the same freedom.
The mount function is the industry standard for framework-agnostic component mounting (proven
by single-spa). React editors use `createRoot`, Svelte 5 uses `mount()`, Vue 3 uses `createApp`.

**Researched alternatives:**
- React-only editors: simpler, every CMS does this, but locks template authors to React for editing
- Web Components: built-in support in Svelte/Vue but not React, Shadow DOM complicates theming
- iframes: total isolation but poor UX (focus, scrolling, DnD don't cross boundaries)

**Known trade-offs:** CSS can leak between editor and host (mitigate with scoped styles).
React synthetic events don't bubble to host DOM (use native events for cross-boundary communication).
HMR is unreliable across frameworks (full remount on change, acceptable).

**Rejected:** React-only (limits template authors), iframes (poor UX), web components (React has no built-in support).
