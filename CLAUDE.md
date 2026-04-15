# Gazetta

Stateless CMS that structures websites as composable fragments. All state lives in targets.

## Structure

- `apps/admin/` — CMS admin frontend (Vue 3 + PrimeVue editor shell)
- `packages/gazetta/` — Core package (renderer, CLI, admin API, editor, storage providers)
- `tools/mcp-dev/` — MCP dev server (screenshot tool)
- `examples/starter/` — Sample site with templates, fragments, pages
- `sites/gazetta.studio/` — The gazetta.studio website (dogfooding)
- `docs/design.md` — Human-readable design document
- `docs/cloudflare.md` — Cloudflare deployment guide (R2, Workers, cache, CI)
- `docs/self-hosted.md` — Self-hosted deployment guide (VPS, Docker, Fly.io)
- `docs/sidecars.md` — Sidecar files (incremental publish, reverse-dep lookups)
- `docs/feature-gaps.md` — CMS feature gap analysis (media, i18n, drafts, SEO, RBAC, etc.) — read when planning new features or discussing roadmap

## Design docs (auto-loaded by Claude)

- `.claude/rules/design-concepts.md` — Fragment, page, node, target model; target properties; active target
- `.claude/rules/design-publishing.md` — Stateless CMS, bidirectional sync, targets, unified Publish
- `.claude/rules/design-decisions.md` — Key decisions and rationale
- `.claude/rules/design-editor-ux.md` — Active target UX spine, switching, progressive disclosure
- `.claude/rules/architecture.md` — System architecture and package layout

## Build & Test

```bash
npm install        # install dependencies (from root)
npm run build      # build all packages
npm run dev        # start dev server (examples/starter on localhost:3000)
npm test           # run all tests
```

**Note:** Page and fragment manifests use JSON (`page.json`, `fragment.json`). Site config stays YAML (`site.yaml`). Components are inline in the page manifest — no separate component files.

## Conventions

- TypeScript strict mode everywhere
- Prefer composition over inheritance
- Extract shared code only when 3+ callers exist
