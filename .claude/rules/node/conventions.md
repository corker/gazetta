---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
---

# Node / TypeScript Conventions

## Formatting & Linting

- Formatter: <!-- Prettier / Biome / etc. -->
- Linter: <!-- ESLint / Biome / etc. -->
- Run: `npm run lint`, `npm run format`

## Type Checking

- `strict: true` in all `tsconfig.json`
- No `any` — use `unknown` and narrow
- Run: `npm run type-check`

## Testing

- Framework: <!-- Vitest / Jest / etc. -->
- Test files: `*.test.ts` alongside source
- Run: `npm test`
