---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
---

# Node / TypeScript Conventions

## Formatting & Linting

- Formatter: **Biome** (config: [biome.json](../../../biome.json))
- Linter: disabled — Biome's `linter.enabled: false`. TypeScript strict mode catches the
  class of errors a linter would. Revisit if a specific rule starts paying its way.
- Run: `npm run format` (writes) · `npm run format:check` (CI gate — the `format` job)

## Type Checking

- `strict: true` in all `tsconfig.json`
- No `any` — use `unknown` and narrow
- No repo-level `type-check` script — the `test` job compiles via Vitest + tsc as a
  side-effect. Per-package `tsc --noEmit` if you need an isolated check.

## Testing

- Framework: **Vitest** (unit/integration) + **Playwright** (e2e under [tests/e2e/](../../../tests/e2e/))
- Unit tests live in `tests/` directories alongside the package (not `*.test.ts` next to source)
- Run: `npm test` (root — `npm run test --workspaces --if-present`) · `npx playwright test` for e2e (no wrapping npm script)
