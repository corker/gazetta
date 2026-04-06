# Gazetta

Stateless CMS that structures websites as composable fragments. All state lives in targets.

## Structure

- `apps/admin-ui/` — CMS admin frontend (Vue 3 + PrimeVue editor shell)
- `packages/gazetta/` — Core package (renderer, CLI, admin API, editor, storage providers)
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
