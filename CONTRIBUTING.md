# Contributing to Gazetta

Thanks for your interest in contributing! Gazetta is an open-source stateless CMS
that structures websites as composable components.

## Getting Started

```bash
git clone https://github.com/corker/gazetta.git
cd gazetta
npm install
npm run build
npm run dev          # site + CMS on http://localhost:3000
npm test             # run all tests
```

## Project Structure

```
packages/
  gazetta/          Core — renderer, CLI, admin API, editor, storage providers
  mcp-dev/          MCP dev server (screenshot tool for Claude Code)
apps/
  admin/         CMS admin frontend (Vue 3 + PrimeVue)
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

# Docker integration tests (S3/MinIO, Azure Blob/Azurite):
npm test -w @gazetta/admin -- tests/docker.test.ts
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

- **Storage providers** — Google Cloud Storage, Git-based providers
- **Templates** — more starter templates (blog layout, card grid, hero variants)
- **Admin UI** — better error states, keyboard shortcuts, accessibility
- **Documentation** — tutorials, API docs, template authoring guide
- **Testing** — E2E tests for the admin UI

## Pull Requests

- Keep PRs focused — one feature or fix per PR
- Add tests for new functionality
- Update docs if you change the API or behavior
- Run `npm test` before submitting

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
