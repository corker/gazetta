# Contributing to Gazetta

Thanks for your interest in contributing! Gazetta is an open-source stateless CMS
that structures websites as composable components.

## Getting Started

```bash
git clone https://github.com/gazetta-studio/gazetta-studio.git
cd gazetta
npm install
npm run build
npm run dev          # dev server on http://localhost:3000
npm test             # run all tests
```

## Project Structure

```
packages/
  core/             TypeScript types (Component, Fragment, Page, StorageProvider)
  renderer/         Hono-based renderer (site loader, resolver, CSS scoping)
  editor-default/   Default editor (@rjsf form wrapped in mount function)
  cli/              CLI tool (gazetta dev)
  mcp-dev/          MCP dev server (screenshot tool for Claude Code)
apps/
  web/              CMS frontend (Vue 3 + PrimeVue) + backend API (Hono)
examples/
  starter/          Sample site with templates, fragments, and pages
sites/
  gazetta.studio/   The gazetta.studio website (dogfooding)
```

## Development Workflow

1. **Fork and clone** the repo
2. **Create a branch** for your change: `git checkout -b my-feature`
3. **Make changes** — follow existing patterns in the codebase
4. **Run tests**: `npm test`
5. **Submit a PR** with a clear description of what and why

## Running Tests

```bash
npm test                          # all tests (excluding Docker-dependent)
npm test -- --reporter verbose    # verbose output

# Publish tests require Docker (Azurite for Azure Blob):
npx vitest run apps/web/tests/publish.test.ts
```

## Code Conventions

- TypeScript strict mode everywhere
- ESM (`"type": "module"`) in all packages
- Prefer composition over inheritance
- Extract shared code only when 3+ callers exist
- No unnecessary abstractions — keep it simple

## Architecture

Read the design docs before making architectural changes:
- [Design Document](docs/design.md) — full architecture and decisions
- [Getting Started](docs/getting-started.md) — how templates work
- `.claude/rules/` — design concepts, publishing model, decisions

### Key Concepts

- **Component** — the building block (has template, content, optional children)
- **Fragment** — shared component, reusable across pages (`fragments/`, `@` reference)
- **Page** — component with route + metadata (`pages/`)
- **Template** — pure function `(params) => { html, css, js }` with a Zod schema
- **StorageProvider** — abstraction for filesystem, S3, Azure Blob
- **Target** — a named storage endpoint for publishing

### Template Contract

Every template exports:

```ts
export default (params) => { html, css, js }  // renderer (required)
export const schema = z.object({ ... })         // Zod schema (required)
export const editor = { mount, unmount }        // custom editor (optional)
```

## Areas to Contribute

### Good First Issues

Look for issues labeled [`good first issue`](https://github.com/gazetta-studio/gazetta-studio/labels/good%20first%20issue).

### Areas That Need Help

- **Storage providers** — S3, Google Cloud Storage, Git-based providers
- **Templates** — more starter templates (blog layout, card grid, hero variants)
- **CMS UI** — better error states, keyboard shortcuts, accessibility
- **Documentation** — tutorials, API docs, template authoring guide
- **Testing** — more edge cases, E2E tests for the CMS UI

## Submitting Issues

- **Bug reports**: include steps to reproduce, expected vs actual behavior
- **Feature requests**: describe the use case, not just the solution
- **Questions**: use [GitHub Discussions](https://github.com/gazetta-studio/gazetta-studio/discussions)

## Pull Requests

- Keep PRs focused — one feature or fix per PR
- Add tests for new functionality
- Update docs if you change the API or behavior
- Run `npm test` before submitting

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
