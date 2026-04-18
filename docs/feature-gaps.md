# Feature Gaps

What's missing for a complete CMS experience, based on what Sanity, Payload, Strapi,
TinaCMS, Decap, Storyblok, and Contentful all provide. Organized by priority tier.

Reference this when planning roadmap priorities. Create issues when a feature moves
into active planning.

## Positioning — what's actually unique

Most individual features exist in competitors. Gazetta's real differentiators are:

1. **The combination** — stateless + multi-target + ESI + framework-agnostic + bidirectional
   sync. No single CMS has all of these together.
2. **ESI edge composition** — pre-rendered HTML fragments assembled at the edge. Zero runtime
   rendering cost. No other CMS uses this approach (API-driven CMSes achieve instant propagation
   differently — via client-side or server-side rendering at request time).
3. **Storage-target independence** — fetch from and publish to S3, R2, Azure Blob, filesystem.
   Not locked to a database or Git provider. Git-based CMSes (TinaCMS, Decap) are disposable
   too, but tied to Git. Gazetta works with any storage.
4. **Template contract as rendering boundary** — `(params) => { html, css, js }` with per-template
   package independence. More granular than Astro's island model.

### What's NOT unique (don't overclaim)

| Claim | Reality |
|-------|---------|
| Multi-target (staging/prod diverge) | Contentful, Sanity, Storyblok all have environments |
| Stateless/disposable CMS | TinaCMS, Decap, Keystatic are all disposable (git-based) |
| Framework-agnostic templates | Astro does React+Vue+Svelte in same project |
| Content in git, templates as code | Entire git-based CMS category does this |
| Bidirectional sync | Drupal, Magnolia, Contentful have environment merging |

### Implications for prioritization

When picking what to build next, ask: does this **strengthen a real differentiator** or
**close a table-stakes gap that blocks adoption**?

- Strengthening differentiators: multi-target promotion UX (#5 compare targets), ESI
  performance, storage provider coverage, template DX
- Closing adoption blockers: media, i18n, drafts, SEO, RBAC — without these, teams
  can't use Gazetta regardless of its unique strengths
- Both audiences matter: developers evaluate the DX, but CMOs are MORE involved (63%)
  than CTOs (52%) in CMS decisions. Content author UX is not secondary.

## What Gazetta already does well

| Feature | Status |
|---------|--------|
| Content modeling (Zod schemas) | Type-safe, auto-generates editor forms |
| Live preview | iframe with real-time updates, edit mode click-to-select |
| CLI tooling | init, dev, publish, serve, deploy, validate |
| TypeScript strict mode | Everywhere |
| Multi-target publishing | Unique — no other CMS has this |
| Bidirectional sync (fetch from targets) | Unique |
| Framework-agnostic templates | React, Vue, Svelte, plain TS |
| Edge delivery (ESI composition) | Cloudflare Workers + Node serve |
| Custom editors and fields | Mount function pattern, any framework |

## Table stakes — blocks real adoption

Every production CMS has these. Their absence is a dealbreaker for most teams.

### Media management

**What others do:** Upload images in the CMS, organize in folders/library, resize/crop/format
on the fly, CDN delivery, alt text management. Sanity has AI auto-tagging. Strapi has
AI-generated alt text. All 7 platforms have at least a basic media library.

**Gazetta today:** Templates reference images by URL. No upload, no library, no transforms.
Content authors must host images elsewhere and paste URLs.

**Scope:** Media library UI in admin, upload API, storage in targets, image transform service
(or integration with Cloudflare Images / imgproxy / sharp).

### Internationalization (i18n)

**What others do:** Per-field or per-document translations, language fallbacks, translation
workflows, admin UI in multiple languages. 6 of 7 have native i18n. Payload does field-level
`localized: true`. Strapi has per-locale draft/publish. Storyblok has per-language permissions.

**Gazetta today:** Documented as "separate pages per locale" — manually duplicate page trees
per language. No fallbacks, no per-field translation, no translation workflow.

**Approaches to consider:**
- Per-field (Payload/Storyblok style): `content.title` becomes `content.title.en`, `content.title.fr`
- Per-document (Strapi style): separate document per locale, linked by ID
- Per-page tree (current): `pages/home/`, `pages/fr/home/` — simplest, no schema changes

### ~~Draft / published states~~ — NOT A GAP

**Why this isn't needed:** Gazetta's multi-target model already provides draft/publish
separation. The local target IS the draft. Save writes to local, publish promotes to
staging/production. Authors can have as many targets as they need — one for drafting,
one for review, one for production.

This is the stateless CMS paradigm: targets replace draft states. What other CMSes
model as a per-document workflow (draft → review → published), Gazetta models as
per-target promotion (local → staging → production). The author's local target is
always a "draft" until they publish.

No additional feature needed.

### SEO metadata

**What others do:** Meta tags (title, description, og:image) with character counters,
SERP preview in admin, structured data / JSON-LD, Open Graph social previews, canonical URLs.
Payload has an official SEO plugin. Storyblok has an SEO App with AI-powered meta generation.

**Gazetta today:** `metadata` field exists in page.json (title, description, og:image).
No admin UI for editing it, no OG preview, no sitemap generation (issue #59 open),
no structured data helpers.

**Scope:** Metadata editor in admin UI (with character counters and SERP preview),
sitemap.xml generation on publish, robots.txt support, JSON-LD helpers for templates.

### Role-based access control

**What others do:** All 7 have at least basic roles (admin, editor, author). 4 of 7 have
field-level permissions. Enterprise tiers add SSO, custom roles, per-content-type access.

**Gazetta today:** Basic auth is binary — authenticated users have full access. No roles,
no per-content-type permissions.

**Scope:** Role definitions in site.yaml, middleware that checks role per API route,
admin UI adapts to role (hide publish button for editors, etc.).

### Webhooks / post-publish hooks

**What others do:** 6 of 7 support webhooks or lifecycle hooks. Sanity has GROQ-powered
webhooks (filter + shape payload). Payload has code-level hooks (beforeChange, afterRead).
Strapi has both UI-configured webhooks and code hooks.

**Gazetta today:** No hooks. Documented as "future: site.yaml hooks field." CI scripts
are the workaround.

**Scope:** `hooks` field in site.yaml with URL + event type. Fire on publish, fetch,
content change. Optional payload shaping.

### Multi-target promotion workflow

**What others do:** Sanity has Content Releases (bundle changes, promote between environments).
Storyblok has Pipelines with one-click stage promotion. Contentful has Launch app for
coordinated releases across environments.

**Gazetta today:** Multi-target is supported (staging + production in site.yaml), and promote
(target A → target B) is in the design docs. But there's no UX for it. Content authors must
use CLI `gazetta publish -t production` or publish per-target from the admin UI with no
visibility into what changed between targets.

**The real workflow:** Author content on a draft target (e.g. Azure Blob local emulator),
preview and iterate, promote to staging (e.g. S3), verify, promote to production (e.g.
Cloudflare R2 + Worker). Each stage may use a different storage provider.

**What's needed:**
- Admin UI: target comparison (diff what's in staging vs production)
- Admin UI: one-click promote with confirmation ("Push 3 changed pages to production?")
- Visual indicators: which pages are ahead/behind per target
- Target pipeline definition in site.yaml (draft → staging → production order)
- This is Gazetta's unique strength (multi-target) — the UX should make it a first-class experience

### Large site editing experience

**What others do:** Sanity handles 100K+ documents with GROQ-powered filtering, virtual
scrolling, and faceted search. Storyblok has folder-based organization with pagination,
search, and filter by content type/status/language. Contentful has saved views, bulk
actions, and content type filtering. All scale their editor UX for sites with hundreds
or thousands of pages.

**Gazetta today:** Flat site tree in the admin sidebar. Works for 10-50 pages. Unknown
how it behaves at 100+ pages, 500+ components, deeply nested fragments. No search, no
filtering, no pagination, no bulk operations.

**Needs research:**
- Profile the admin UI with a large site (100+ pages, 20+ fragments)
- Identify bottlenecks: tree rendering, API response times, preview load, component tree depth
- Study how Sanity Studio, Storyblok, and Payload handle large content sets — navigation
  patterns, search, filtering, grouping, virtual scrolling, lazy loading
- Design the best editor UX for browsing, finding, and editing content at scale
- Consider: nested route tree (#88), search/filter, pagination, virtual scrolling,
  bulk publish, content type grouping, recently edited, favorites/pinned

### MCP server as admin interface

**What others do:** Sanity has GROQ for programmatic content access. Payload has a full
REST + GraphQL API. Contentful has Management API + CLI. All allow non-UI content operations
for automation, scripting, and AI agent workflows.

**Gazetta today:** Issue #49 tracks an MCP server concept. The `tools/mcp-dev/` package
exists but only provides screenshot/interaction tools for development. No MCP server
exposes the admin API for content operations.

**Two use cases:**
- **Deployed admin:** MCP server connects to a remote Gazetta instance (e.g. production
  admin at `https://admin.mysite.com`). AI agents can read pages, edit content, publish,
  fetch — same operations as the admin UI but via MCP tools. Enables AI-assisted content
  authoring, bulk operations, migration scripts.
- **Local site dev:** MCP server connects to `gazetta dev` running locally. Claude Code
  can read the site tree, edit content YAML, preview pages, publish to targets — all
  without the developer switching to the browser. Template developers get AI-assisted
  content testing.

**Scope:** MCP server that wraps the existing admin API (`/api/pages`, `/api/fragments`,
`/api/templates`, `/api/publish`, `/api/fetch`). Runs as a sidecar to `gazetta dev` or
connects to a remote admin URL. Tools: list-pages, read-page, update-page, list-fragments,
read-fragment, update-fragment, publish, fetch, preview.

## Expected — noticeable absence

Most platforms offer these. Teams with content workflows need them.

### Content versioning / history

**What others do:** 6 of 7 have version history with rollback. Sanity has per-field diffs.
Payload has configurable max versions. TinaCMS and Decap use git history.

**Gazetta today:** Git is the only history mechanism. No version tracking in the CMS,
no rollback UI, no diff view.

**Natural fit:** Git-based versioning (like TinaCMS/Decap) — Gazetta already stores
content as YAML files in git. The admin UI could show git log for a page and offer
rollback.

### Scheduled publishing

**What others do:** 5 of 7 support it. Sanity has Content Releases (bundle changes,
schedule date/time). Strapi has Releases with timezone-aware scheduling. Contentful
has Launch app.

**Gazetta today:** No scheduled publishing. Publish is immediate.

**Scope:** Schedule field on publish action, background job that triggers publish at
the scheduled time. Requires a persistent process (not stateless).

### Review workflows

**What others do:** 5 of 7 offer workflow stages. Strapi has customizable stages
(To do, In progress, Ready to review, Reviewed) with RBAC per stage. Storyblok has
Pipelines with one-click promotion.

**Gazetta today:** No workflow states. Content is either saved locally or published.

**Depends on:** Draft states and RBAC — workflows build on top of both.

### Audit log

**What others do:** 5 of 7 offer audit logging (often Enterprise tier). Tracks who
changed what, when, and what action was taken.

**Gazetta today:** Publish actions logged to stdout. No structured audit log. No UI.

**Scope:** Log publish, save, fetch actions with timestamp, user, target, items.
Store in a log file or external service.

### Image transformations

**What others do:** 5 of 7 have built-in image processing. Sanity has a full Image CDN
(resize, crop, focal-point, WebP/AVIF). Contentful has Images API. Storyblok has
Image Service.

**Gazetta today:** No image processing. Templates handle images as raw URLs.

**Depends on:** Media management — transforms are part of the media pipeline.

## Nice-to-have — differentiators

Not expected for a CMS at Gazetta's stage. Listed for future reference.

| Feature | Who does it well | Notes |
|---------|-----------------|-------|
| Real-time collaborative editing | Sanity (best-in-class) | Google Docs-level multiplayer. No other CMS comes close. |
| In-document comments | Sanity, Storyblok, Contentful | Component-level discussions, task assignments |
| AI features | Sanity (media AI), Strapi (alt text), Storyblok (SEO AI) | Emerging, not table stakes yet |
| Visual inline editing | Storyblok, TinaCMS | Click-to-edit in the preview. Gazetta's edit mode is close. |
| Content locking | Payload (explicit locks) | Most use optimistic concurrency instead |
| Plugin/extension ecosystem | Strapi (1500+), Storyblok (App Directory) | Requires stable API surface first |
| SSO | 5 of 7 (Enterprise tier) | Required for enterprise adoption |
| GraphQL API | 5 of 7 offer it alongside REST | Nice for frontend devs, not essential |
| Field-level permissions | Sanity, Payload, Storyblok, Contentful | Enterprise feature, builds on RBAC |
