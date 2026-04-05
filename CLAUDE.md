# Gazetta

Stateless CMS that structures websites as composable fragments. All state lives in targets.

## Structure

- `apps/web/` — CMS frontend (stateless editor UI)
- `packages/shared/` — Shared types and utilities (fragment, page, target models)
- `packages/renderer/` — Hono-based renderer (site loader, resolver, renderer, dev server)
- `examples/starter/` — Sample site with templates, fragments, pages
- `docs/design.md` — Human-readable design document

## Design docs (auto-loaded by Claude)

- `.claude/rules/design-concepts.md` — Fragment, page, node, target model
- `.claude/rules/design-publishing.md` — Stateless CMS, bidirectional sync, targets
- `.claude/rules/design-decisions.md` — Key decisions and rationale
- `.claude/rules/architecture.md` — System architecture and package layout

## Build & Test

```bash
npm install        # install dependencies (from root)
npm run build      # build all packages
npm run dev        # start dev server (examples/starter on localhost:3000)
npm test           # run all tests
```

**Note:** `@` in YAML component references must be quoted (`"@header"`) since `@` is reserved in YAML.

## Conventions

- TypeScript strict mode everywhere
- Prefer composition over inheritance
- Extract shared code only when 3+ callers exist
