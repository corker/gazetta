# Shared Library

Shared types and utilities used across apps.

## Structure

- `src/` — source code
- `src/index.ts` — public API (barrel export)

## Commands

```bash
npm run build    # compile
npm test         # run tests
```

## Rules

- Everything exported from `src/index.ts` is public API
- Breaking changes require updating all consumers in this monorepo
