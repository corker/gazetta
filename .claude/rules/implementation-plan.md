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

### Dependency chain details

11. **@rjsf and Tiptap React deps.** Both declare React as peer dep. When gazetta moves
    React to peer, npm resolves @rjsf's and Tiptap's peer from the same source. Verify
    with `npm ls react` after the change — should show one copy, no duplicates.

12. **`gazetta init` version pinning.** Init should pin the exact gazetta version it's running:
    `"gazetta": "^{currentVersion}"` in both `admin/` and `templates/` package.json.

13. **Monorepo nested workspaces.** After restructuring `examples/starter/` to have its own
    `workspaces: ["admin", "templates"]`, the monorepo root doesn't need to list sub-workspaces.
    npm resolves nested workspace configs. Root keeps `"examples/*"`, starter's package.json
    declares its own workspaces.

14. **Project root detection in monorepo.** Two detection modes needed:
    - Site project: walks up, finds `package.json` with `workspaces` containing `"admin"` + `"templates"`
    - Monorepo: contributor runs from `examples/starter/` — finds starter's package.json (which
      has the right workspaces). Running from monorepo root without specifying a site → error.

15. **Vite setup for npm-installed gazetta.** In site projects, admin SPA is pre-built
    (`node_modules/gazetta/admin-dist/`). `gazetta dev` serves pre-built admin as static files
    AND runs a minimal Vite server for custom editors only (transforms `admin/editors/` and
    `admin/fields/`). Two servers: static for admin shell, Vite for custom code. The pre-built
    admin loads editors from the Vite dev URL.

16. **`getPublishMode()` shared function.** Centralize publish mode logic:
    ```ts
    function getPublishMode(target: TargetConfig): 'esi' | 'static' {
      return target.publishMode ?? (target.worker ? 'esi' : 'static')
    }
    ```
    Used by CLI `publish`, admin API `POST /api/publish`, and `gazetta validate`.

17. **Dev playground mock data.** Generate from JSON Schema `default` values. If no defaults,
    use Zod schema to generate a minimal valid object (empty strings, 0 for numbers, false for
    booleans). The playground shows a "Reset to defaults" button.

18. **`buildUiSchema` recursive field detection.** Walk the full JSON Schema tree:
    `properties` → nested `properties` → `items.properties` (for arrays). Collect `meta.field`
    at all levels. Map each to an async widget wrapper with the correct import path.

19. **`gazetta/editor` bundle size.** DefaultEditorForm pulls in @rjsf + React + Tiptap.
    Standalone ESM bundle ~500KB+. Consider: split `gazetta/editor` into two exports:
    - `gazetta/editor` — lightweight (createEditorMount only)
    - `gazetta/editor/form` — full (DefaultEditorForm + @rjsf + Tiptap)
    Custom editors that don't embed the default form get the lightweight import.

20. **Interactive prompts library.** Add `@clack/prompts` (MIT, 5KB, modern UX, built for CLIs).
    Used for: site selection, target selection, confirmation dialogs. Skipped when `CI=true`.

21. **`sites/gazetta.studio/` migration.** Separate task — not part of Phase 1. Production site
    with CI/CD, Cloudflare deployment. Migrate after the new structure is proven with starter.
    Add as a follow-up task, not a blocker.

### Fundamental questions

24. **Should we restructure first or build features first?** The restructure (Phase 1.4-1.5)
    is the largest, riskiest change with zero user-visible benefit. Custom editors can work
    with the current flat structure — the Vite alias handles any layout. Consider: implement
    custom editors first (prove the architecture), restructure later (apply proven patterns).

25. **Types before consumers?** Phase 1 adds `FieldMount` and changes `EditorMount` props
    for consumers that don't exist until Phase 4-5. Untested interfaces are guesses. Better:
    add types when implementing their consumers.

26. **`build` command before there's anything to build?** Phase 2 adds `build` but
    custom editors (the main build target) arrive in Phase 4-5. Move `build` to Phase 6.

27. **What's the MVP?** The minimum that delivers value: custom editors working in dev mode
    (through Phase 4). Everything else is enhancement. The plan should explicitly mark MVP
    vs nice-to-have phases.

28. **Decision: restructure first.** The structure is the foundation. Building features on
    the old flat structure means rewriting them when restructuring. One migration, then build
    on solid ground.

### Cascade effects

29. **`createAdminApp` signature change** cascades through 5+ files:
    - `packages/gazetta/src/admin-api/index.ts`
    - `packages/gazetta/src/cli/index.ts` (two call sites)
    - `apps/admin/src/server/dev.ts`
    - `apps/admin/tests/api.test.ts`
    - Every route handler needing project root

30. **`findCmsDir()` needs a third search path** for npm-installed gazetta:
    - Current: `apps/admin/` (monorepo source) or `admin-dist/` (pre-built)
    - Needed: `node_modules/gazetta/admin-dist/` (npm package)

31. **Nested workspaces in monorepo** — starter's `admin/` and `templates/` hoist deps to
    monorepo root, not to starter root. Different behavior from standalone site projects.
    Must test both scenarios.

32. **CLI framework.** Current CLI uses manual `process.argv` parsing. Adding prompts
    (@clack/prompts) and growing command complexity suggests considering a CLI framework
    (citty, cleye). Evaluate before adding more commands.

33. **Docs updates per phase.** Per team-preferences.md rule #8: update docs in the same
    commit as the feature. getting-started.md, CLAUDE.md, design docs all need updating
    as behavior changes.

### Plan structure issues

34. **Phase 1 mixes types and structure.** Split into 1A (types + package changes, verifiable
    with build+test) and 1B (structure migration, large and risky). Types first, then structure.

35. **No spike phase for risky assumptions.** Vite dual-server setup (Gap 15), import maps
    (Phase 6.3), nested workspaces (Gap 13) — all researched theoretically but never tested
    end-to-end. Add Phase 0: Spikes — throwaway prototypes to validate risky assumptions
    before committing to the architecture.

36. **CLI framework decision must happen before Phase 2.** Research citty, cleye, @clack/prompts.
    Decide before building CLI features on manual arg parsing.

37. **Phase 2.3 conflates monorepo and npm-install dev modes.** Vite injection (alias, fs.allow)
    only applies to monorepo. npm-install dev uses a dual-server setup (static admin + Vite for
    custom code). These are two architectures — Phase 2 should implement both explicitly.

38. **Phase 4.3 DefaultEditorForm extraction is a major refactor.** mount.tsx is a monolith
    (widgets, templates, styles, state, registry). Extracting DefaultEditorForm means
    untangling undo stack, formData state, widget/template registries, style injection.
    This is 2+ days by itself, not one bullet point.

39. **Phase 6 import maps never tested end-to-end.** Individual steps verified but the full
    chain (Vite build → esbuild editors → import map → serve → load → render) untested.
    Needs an integration test or spike.

40. **File creation order in `gazetta init`.** Workspace package.json files (admin/, templates/)
    must all exist before `npm install` runs. Init must create all files first, then install.

41. **Monorepo dev script changes.** `npm run dev` currently runs starter directly via tsx.
    After restructure, starter's dev script changes. Need to update monorepo root scripts too.

42. **No standalone test project.** The starter is a monorepo example — npm behavior differs
    from standalone site projects (hoisting to monorepo root vs project root). Need a test
    scenario outside the monorepo to verify standalone behavior.

### React dependency audit

43. **Full audit of React-dependent packages.** gazetta has 6+ packages that depend on React:
    `@rjsf/core`, `@rjsf/utils`, `@rjsf/validator-ajv8`, `@tiptap/react`,
    `@hello-pangea/dnd`, `@floating-ui/dom`. When React moves to peer dep, verify each
    resolves React correctly. Run `npm ls react` after the change — must show one copy.

### Core function cascade

44. **`loadSite()` is the central function** — used by dev, publish, validate, preview.
    Currently loads templates + fragments + pages all from `siteDir`. After restructure:
    - Templates: `projectRoot/templates/`
    - Fragments: `projectRoot/sites/{name}/fragments/`
    - Pages: `projectRoot/sites/{name}/pages/`
    - site.yaml: `projectRoot/sites/{name}/site.yaml`

    `loadSite` signature must change from `(siteDir, storage)` to
    `({ projectRoot, siteName, storage })`. This cascades through:
    - `packages/gazetta/src/site-loader.ts` (function itself)
    - `packages/gazetta/src/resolver.ts` (template resolution)
    - `packages/gazetta/src/cli/index.ts` (dev, publish, validate calls)
    - `packages/gazetta/src/admin-api/routes/preview.ts`
    - `packages/gazetta/src/admin-api/routes/publish.ts`
    - `packages/gazetta/src/admin-api/routes/templates.ts`
    - `packages/gazetta/src/admin-api/routes/pages.ts`
    - `packages/gazetta/src/admin-api/routes/fragments.ts`
    - `packages/gazetta/src/admin-api/routes/components.ts`
    - `packages/gazetta/tests/` (integration, admin-api, cli tests)

    This is the largest cascade in the entire plan. Map every call site before starting.

45. **File watcher needs two directories.** Currently watches `siteDir`. After restructure,
    watch both `projectRoot/templates/` (template changes) and `projectRoot/sites/{name}/`
    (content changes). Two `fs.watch()` calls or one `watch(projectRoot)` with path filtering.

46. **`admin-dist/` must be in npm package `files` field.** When gazetta publishes to npm,
    `admin-dist/` (pre-built admin SPA) must be included. Check `packages/gazetta/package.json`
    `files` field. If missing, add: `"files": ["dist", "admin-dist", "src"]`.

47. **Non-TTY prompt fallback.** When stdin is not interactive (piped npm script, Docker),
    prompts can't render. Detect with `process.stdin.isTTY`. If not TTY and not CI:
    auto-select first option with warning: "Non-interactive: using site 'main'".

### Phase boundary risks

48. **Phase 1 and Phase 2 are coupled — no stable state between them.** After Phase 1
    restructures the starter, the CLI still expects the old flat layout. `gazetta dev`,
    `publish`, `validate` all break. Phase 2 fixes them. But between merging Phase 1 and
    completing Phase 2, the project is broken on main. Options:
    - Implement Phase 1 + Phase 2 CLI changes as one atomic branch
    - Phase 1 adds backward compatibility (CLI supports both old and new structure)
    - Accept that main is broken between phases (feature branch only)
    
    **Recommendation:** One branch for Phase 1 + Phase 2 core changes. Merge when both work.

49. **Test update order.** Two strategies:
    - Tests-first: update tests to expect new structure (they fail) → restructure (they pass)
    - Code-first: restructure (tests fail) → fix tests (they pass)
    Tests-first is safer — you know exactly what the target state is.

50. **`@templates` tsconfig path alias location.** Should be in `admin/tsconfig.json`
    (editors use it), NOT root tsconfig. Vite also needs `resolve.alias: { '@templates': ... }`.
    Two config points that must stay in sync. Consider: Vite reads from tsconfig paths
    (via `vite-tsconfig-paths` plugin) to avoid duplication.

51. **`gazetta/types` vs main export.** Currently types are exported from main entry
    (`import { EditorMount } from 'gazetta'`). The design docs reference `gazetta/types`
    as a separate subpath. Decide: types from main (simpler, one import) or separate
    subpath (explicit, avoids pulling in runtime code when only types needed).
    `import type` erases at compile time anyway — so main export is fine for types.
    Only `gazetta/editor` needs to be separate (browser-only code).

52. **Storage paths don't change.** The restructure changes the filesystem layout but NOT
    the storage layout. Pages are still `pages/{name}/` in storage. Fragments still
    `fragments/{name}/`. The site directory name (`sites/my-site/`) is NOT part of the
    storage path. Verify: `publishPageRendered()` uses page names, not filesystem paths.

53. **Hand-written workers vs generated workers.** `sites/gazetta.studio/worker/` has a
    hand-written Cloudflare Worker. Phase 6 generates workers. Decision: generated workers
    replace hand-written ones. The hand-written worker becomes the template for the generator.
    Until Phase 6, hand-written workers continue to work.

54. **Error handling strategy.** Define before implementing:
    - `GazettaError` base class with `code`, `message`, `hint` properties
    - Error codes: `TEMPLATE_NOT_FOUND`, `SITE_NOT_FOUND`, `STORAGE_ERROR`, etc.
    - CLI formats errors consistently: `Error: [code] message\n  Hint: suggestion`
    - Thrown through the call stack, caught at CLI level and formatted

55. **Logging strategy.** Use a simple structured logger:
    - `log.info(message)`, `log.warn(message)`, `log.error(message)`
    - Context: `log.info('Template loaded', { template: 'hero', duration: '45ms' })`
    - Verbosity: `--verbose` shows debug-level, default shows info+warn+error
    - No external dependency — simple wrapper around console with formatting

22. **Git strategy.** One feature branch per phase. Merge to main after phase verification.
    Each phase is a coherent set of changes that can be reviewed and reverted independently.

23. **Test update strategy.** Before starting each phase, grep for affected paths/functions:
    ```
    grep -r "examples/starter" packages/gazetta/tests/
    grep -r "siteDir" packages/gazetta/tests/
    grep -r "createAdminApp" apps/admin/tests/
    ```
    Update tests as part of the phase, not as a separate step.

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
