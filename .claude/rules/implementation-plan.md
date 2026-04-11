# Implementation Plan

Map from design docs to code. Ordered by dependency — each phase enables the next.

## Phase 1: Foundation (structure + types)

Must be done first — everything else depends on the project structure and type system.

### 1.1 React as peer dependency
- Move `react`, `react-dom` from `dependencies` to `peerDependencies` in `packages/gazetta/package.json`
- Move `@types/react`, `@types/react-dom` to `peerDependencies`
- Update root `package.json` to ensure React is available for monorepo dev

### 1.2 Add `FieldMount` type
- Add `FieldMount` interface to `packages/gazetta/src/types.ts`
- Add `schema` and `theme` to `EditorMount.mount()` props
- Remove `editor?` from `TemplateModule` (editors are separate files)

### 1.3 Add `publishMode` to `TargetConfig`
- Add `publishMode?: 'esi' | 'static'` to `TargetConfig` in `types.ts`
- Add `locale?`, `baseUrl?` to `SiteManifest` in `types.ts`

### 1.4 Update `gazetta init` to create new structure
- Scaffold: `admin/`, `templates/`, `sites/main/`, workspaces, `.gitignore`, `tsconfig.json`
- Run `npm install` after scaffold
- Create `admin/package.json` with gazetta + react as deps
- Create `templates/package.json` with gazetta + zod as deps

### 1.5 Update example starter to match new structure
- Restructure `examples/starter/` → `admin/`, `templates/`, `sites/main/`
- Update monorepo root workspaces to include new paths
- Update all tests

## Phase 2: CLI updates

### 2.1 Project root detection
- CLI walks up from cwd looking for `package.json` with `workspaces: ["admin", "templates"]`
- Templates loaded from `{projectRoot}/templates/`
- Sites discovered from `{projectRoot}/sites/`

### 2.2 Auto-detection with prompts
- Site: only one dir in `sites/` → auto-select. Multiple → prompt (CI: error)
- Target: only one in site.yaml → auto-select. Multiple → prompt (CI: error)
- CI detected via `CI=true` env var

### 2.3 Update `gazetta dev` for new structure
- Load templates from project root `templates/`
- Load site content from `sites/{name}/`
- Inject Vite config: `resolve.alias: { '@site': projectRoot }`, `server.fs.allow`

### 2.4 Update `gazetta publish` for `publishMode`
- Use `publishMode` field (default: `esi` if worker, `static` otherwise)
- Admin API: also check `publishMode` (fix known gap #1)

### 2.5 Add `gazetta build` command
- Build admin SPA via Vite `build()` API → `dist/admin/`
- Bundle custom editors/fields with esbuild → `dist/admin/editors/`, `dist/admin/fields/`
- Generate import map → inject into `dist/admin/index.html`
- Generate worker code per target → `dist/workers/{target}/`

### 2.6 Update `gazetta serve` for new structure
- Serve admin from `dist/admin/` if exists
- Load site from project root structure
- Positional target argument

## Phase 3: Default editor theming

### 3.1 CSS variables in mount.tsx
- Replace hardcoded dark hex values with CSS variables
- Define variables: `--gz-bg`, `--gz-text`, `--gz-border`, `--gz-accent`, `--gz-input-bg`

### 3.2 EditorPanel sets CSS variables
- Read theme from `useThemeStore()`
- Set CSS variables on editor container element based on dark/light

### 3.3 Pass theme to mount props
- `useEditorMount` passes `theme: 'dark' | 'light'` to `mount()`
- Remount on theme change via `mountVersion`

## Phase 4: Custom editors

### 4.1 Editor discovery API
- `hasEditorFile()` in template-loader — checks `admin/editors/{name}.{ts,tsx}`
- `GET /api/templates/:name/schema` response includes `hasEditor: boolean`

### 4.2 Editor loading in admin UI
- `editing.ts` store: `customEditorMount` ref
- In `open()`: if `hasEditor`, dynamic import the editor module via Vite alias
- `EditorPanel.vue`: use custom editor if available, else default

### 4.3 Extract `DefaultEditorForm` component
- Extract @rjsf Form wrapper as a standalone React component
- Export from `gazetta/editor` alongside `createEditorMount`
- Custom editors can embed it: `<DefaultEditorForm schema={...} content={...} onChange={...} />`

### 4.4 Dev playground
- New Vue route at `/admin/dev`
- `DevPlayground.vue`: sidebar listing editors/fields, main area for rendering
- Dynamic import of selected editor/field, mount with mock data
- Theme toggle, value inspector, reset controls

## Phase 5: Custom fields

### 5.1 Field discovery API
- `GET /api/fields` — lists `.ts`/`.tsx` files in `admin/fields/`
- Returns field names for schema validation

### 5.2 Field loading in @rjsf
- `buildUiSchema()` detects `meta.field` on schema properties (all levels, recursive)
- Async widget wrapper: imports field module, mounts `FieldMount` into widget DOM

### 5.3 Reference implementations
- `examples/starter/admin/editors/hero.tsx` — custom editor with DefaultEditorForm
- `examples/starter/admin/fields/brand-color.tsx` — custom field widget

## Phase 6: Production build pipeline

### 6.1 Admin build
- `gazetta build` runs Vite `build()` for admin SPA
- Output: `dist/admin/`

### 6.2 Editor/field bundling
- Scan `admin/editors/` and `admin/fields/`
- esbuild each with `external: ['react', 'react-dom', 'react-dom/client', 'gazetta/editor', 'gazetta/types']`
- Output: `dist/admin/editors/{name}.js`, `dist/admin/fields/{name}.js`

### 6.3 Shared deps + import map
- Bundle React, gazetta/editor as standalone ESM
- Generate import map JSON
- Inject into `dist/admin/index.html`

### 6.4 Worker generation
- Generate worker code per target with worker config
- Output: `dist/workers/{target}/`

## Implementation order

```
Phase 1 (foundation)     ██████ ~2-3 days
Phase 2 (CLI)            ████████ ~3-4 days
Phase 3 (theming)        ███ ~1 day
Phase 4 (custom editors) ██████ ~2-3 days
Phase 5 (custom fields)  ████ ~2 days
Phase 6 (prod build)     ██████ ~2-3 days
```

Start with Phase 1 — everything depends on it. Phases 3-5 can partially overlap.
Phase 6 can be deferred if production admin hosting isn't needed yet.

## Verification per phase

| Phase | Verification |
|-------|-------------|
| 1 | `npm run build && npm test` pass. `gazetta init` creates new structure. |
| 2 | `gazetta dev` works with new structure. Auto-detection prompts. `publishMode` respected. |
| 3 | Toggle dark/light → editor follows theme. |
| 4 | Custom editor mounts. DefaultEditorForm embeddable. Dev playground works. |
| 5 | Custom field renders inside @rjsf form. Nested + array fields work. |
| 6 | `gazetta build` produces dist/admin/ with import maps. `gazetta serve` serves it. |
