# Gazetta

Stateless CMS that structures websites as composable fragments. All state lives in targets.

## Structure

- `apps/web/` — CMS frontend (stateless editor UI)
- `packages/core/` — TypeScript types (Component, Fragment, Page, StorageProvider)
- `packages/renderer/` — Hono-based renderer (site loader, resolver, renderer, dev server)
- `packages/editor-default/` — Default editor (@rjsf form wrapped in mount function)
- `packages/cli/` — CLI tool (gazetta dev)
- `packages/mcp-dev/` — MCP dev server (screenshot tool)
- `examples/starter/` — Sample site with templates, fragments, pages
- `sites/gazetta.studio/` — The gazetta.studio website (dogfooding)
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
