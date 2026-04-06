# Admin UI

CMS admin frontend — Vue 3 + PrimeVue shell with editor mounting and preview.

## Structure

- `src/client/` — Vue 3 SPA (stores, components, composables, router)
- `src/server/` — Dev server entry (`dev.ts`) + re-export of admin API (`index.ts`)
- `tests/` — API and Docker integration tests

## Commands

```bash
npm run dev      # start Vite dev server + API server
npm run build    # production build
npm test         # run tests
```
