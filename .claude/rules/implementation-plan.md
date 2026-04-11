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

## Gaps and risks in this plan

### Dependency issues

1. **Phase 1.1 (React peer dep) breaks monorepo build.** `packages/gazetta/` compiles `mount.tsx`
   which imports React. After moving to peer dep, React must still be available for compilation.
   Fix: add React as `devDependency` in root `package.json` (hoisted to monorepo root).

2. **Phase 1.2 (EditorMount props change) breaks all callers.** Must update:
   - `apps/admin/src/client/composables/useEditorMount.ts`
   - `apps/admin/src/client/components/EditorPanel.vue`
   - `packages/gazetta/src/editor/mount.tsx` (createEditorMount)
   - All tests that call mount()

3. **Phase 2.5 (build command) depends on Phase 4+5.** Build bundles editors/fields, but they
   aren't implemented until Phase 4-5. Fix: Phase 2 `build` only builds admin SPA + worker.
   Editor/field bundling added in Phase 6 after Phase 4-5.

4. **Phase 4 hard-depends on Phase 3** (theme in mount props). Not "partially overlapping."

### Structure migration

5. **Phase 1.4-1.5 is the largest task** — restructure starter, update all paths, update
   all tests. Must also handle `sites/gazetta.studio/`. This is easily 2 days by itself.
   Break into sub-tasks:
   - Restructure `examples/starter/` directories
   - Update `examples/starter/package.json` (workspaces)
   - Update all test file paths in `packages/gazetta/tests/`
   - Update `sites/gazetta.studio/` structure
   - Update monorepo root workspaces
   - Verify `npm run dev` and `npm test` still work

6. **No backward compatibility.** All changes are breaking. Existing sites that use the flat
   structure break. Fix: CLI detects structure (flat vs workspace) and supports both during
   migration period. Or: one big migration commit that updates everything.

### Admin API path changes

7. **Admin API needs project root, not just site dir.** Currently `createAdminApp(siteDir, storage)`.
   Must become `createAdminApp({ projectRoot, siteDir, storage })` so the API can find
   templates at `{projectRoot}/templates/` and editors at `{projectRoot}/admin/editors/`.

### Dev vs production editor loading

8. **Custom editor import paths differ between dev and production.**
   - Dev: `import('@site/admin/editors/hero.tsx')` (Vite alias)
   - Production: `import('/admin/editors/hero.js')` (pre-built from dist)
   - The admin UI code needs to detect the mode and use the right path.
   - Fix: admin API returns the editor URL. Dev returns Vite alias path. Production returns
     dist path. Admin UI always uses the URL from the API.

### Missing from the plan

9. **`gazetta validate` improvements** — not listed anywhere. Should be a phase:
   - Check content against template Zod schemas
   - Check for orphaned editors (editor without template)
   - Check for missing fields (schema references nonexistent field)
   - Check for cross-workspace runtime imports
   - Check gazetta version mismatch across workspaces

10. **Test updates per phase** — each phase changes behavior that tests validate. Identify
    affected test files before starting each phase.

## Revised implementation order

```
Phase 1 (foundation)     ██████████ ~3-4 days (structure migration is large)
Phase 2 (CLI)            ████████ ~3-4 days
Phase 3 (theming)        ███ ~1 day
Phase 4 (custom editors) ██████ ~2-3 days  (depends on Phase 3)
Phase 5 (custom fields)  ████ ~2 days      (depends on Phase 4)
Phase 6 (prod build)     ██████ ~2-3 days  (depends on Phase 4+5)
Phase 7 (validate)       ███ ~1 day
```

Phases 3→4→5→6 are strictly sequential. Phase 7 can be done anytime after Phase 5.

## Verification per phase

| Phase | Verification |
|-------|-------------|
| 1 | `npm run build && npm test` pass. `gazetta init` creates new structure. React is peer dep. |
| 2 | `gazetta dev` works with new structure. Auto-detection prompts. `publishMode` respected. |
| 3 | Toggle dark/light → editor follows theme. CSS variables set on container. |
| 4 | Custom editor mounts. DefaultEditorForm embeddable. Dev playground works. Editor URL from API. |
| 5 | Custom field renders inside @rjsf form. Nested + array fields work. Async loading handles flash. |
| 6 | `gazetta build` produces dist/admin/ with editor bundles + import maps. `gazetta serve` serves it. |
| 7 | `gazetta validate` catches orphaned editors, missing fields, schema mismatches. |
