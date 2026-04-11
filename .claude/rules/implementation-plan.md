# Implementation Plan

Build Gazetta as designed in the docs. Each step ships value AND builds foundation for the next.
No deferring. Ordered by what enables what.

## Step 1: Editor theming (light mode)

Ship immediately. User-visible value. Proves the theme contract for custom editors.

**Changes:**
- `packages/gazetta/src/editor/mount.tsx` — replace hardcoded hex with CSS variables
- `apps/admin/src/client/components/EditorPanel.vue` — set CSS variables from theme store

**Color variables:**

| Variable | Dark | Light |
|----------|------|-------|
| `--gz-bg-input` | `#161622` | `#ffffff` |
| `--gz-bg-card` | `#1a1a28` | `#f9fafb` |
| `--gz-bg-toolbar` | `#1a1a2a` | `#f3f4f6` |
| `--gz-bg-chip` | `#252538` | `#e5e7eb` |
| `--gz-bg-code` | `#12121e` | `#f1f5f9` |
| `--gz-text` | `#e0e0e0` | `#1a1a1a` |
| `--gz-text-secondary` | `#ccc` | `#4b5563` |
| `--gz-text-label` | `#8888a0` | `#6b7280` |
| `--gz-text-hint` | `#444` | `#9ca3af` |
| `--gz-border` | `#2a2a3a` | `#e5e7eb` |
| `--gz-border-subtle` | `#1e1e2e` | `#f3f4f6` |
| `--gz-accent` | `#667eea` | `#667eea` |
| `--gz-error` | `#f87171` | `#dc2626` |
| `--gz-success` | `#4ade80` | `#16a34a` |

**Verify:** toggle dark/light → editor follows theme.

## Step 2: Fix admin API publish bug

Ship quality. One-line fix for Known Gap #1.

**Changes:**
- `packages/gazetta/src/admin-api/routes/publish.ts` — check `!targetConfig?.worker` for static vs ESI
- Add publish tests (none exist)

**Verify:** publish from admin UI to static target → produces assembled HTML, not ESI.

## Step 3: Types foundation

Update types for everything that follows. One commit, clean break.

**Changes:**
- `packages/gazetta/src/types.ts`:
  - Add `schema: Record<string, unknown>` and `theme: 'dark' | 'light'` to `EditorMount.mount()` props
  - Add `FieldMount` interface
  - Add `publishMode?: 'esi' | 'static'` to `TargetConfig`
  - Add `locale?: string`, `baseUrl?: string` to `SiteManifest`
  - Remove `editor?` from `TemplateModule`
- `packages/gazetta/src/editor/mount.tsx` — accept `schema` and `theme` in mount props (ignore for now, default editor has them from closure)
- `apps/admin/src/client/composables/useEditorMount.ts` — pass `schema` and `theme`
- `apps/admin/src/client/components/EditorPanel.vue` — pass `schema` and `theme`
- `packages/gazetta/src/site-loader.ts` — add `templatesDir` to `Site` interface
- `packages/gazetta/src/manifest.ts` — parse `publishMode`, `locale`, `baseUrl` from site.yaml
- Update `loadSite` to accept options object (overloaded, backward compatible):
  ```ts
  interface LoadSiteOptions { siteDir: string; templatesDir?: string; storage: StorageProvider }
  export function loadSite(opts: LoadSiteOptions): Promise<Site>
  /** @deprecated */ export function loadSite(siteDir: string, storage: StorageProvider): Promise<Site>
  ```

**Verify:** `npm run build && npm test` — all 225 tests pass, no behavior change.

## Step 4: React as peer dependency

Decouple gazetta from React version. Required for custom editors sharing React.

**Changes:**
- `packages/gazetta/package.json` — move `react`, `react-dom`, `@types/react`, `@types/react-dom` to `peerDependencies`
- `packages/gazetta/tsconfig.json` — add `"react"`, `"react-dom"` to `types` array
- `package.json` (root) — add `react`, `react-dom`, `@types/react`, `@types/react-dom` to `devDependencies`
- Regenerate lockfile

All React-dependent packages already use peer deps (confirmed):
- `@rjsf/core`: `react@>=18` (peer)
- `@tiptap/react`: `react@^17||^18||^19` (peer)
- `@hello-pangea/dnd`: `react@^18||^19` (peer)

**Verify:** `npm install && npm run build && npm test && npm ls react` (one copy).

## Step 5: Custom editors in dev mode

Prove the architecture. One working editor end-to-end.

**File structure (flat, current layout):**
```
examples/starter/
  editors/               # NEW
    hero.tsx
  templates/
  fragments/
  pages/
```

**Changes:**

Discovery:
- `packages/gazetta/src/template-loader.ts` — add `hasEditorFile(storage, editorsDir, name)`
- `packages/gazetta/src/admin-api/routes/templates.ts` — schema response includes `hasEditor`

Vite alias:
- `packages/gazetta/src/cli/index.ts` — inject `resolve.alias: { '@editors': join(siteDir, 'editors') }` + `server.fs.allow`

Admin UI loading:
- `apps/admin/src/client/stores/editing.ts` — `customEditorMount` ref, load via `import('@editors/{name}.tsx')`
- `apps/admin/src/client/components/EditorPanel.vue` — branch custom/default

DefaultEditorForm:
- `packages/gazetta/src/editor/mount.tsx` — extract @rjsf Form as `DefaultEditorForm` React component
- Export from `gazetta/editor`

Reference:
- `examples/starter/editors/hero.tsx` — live preview + embedded DefaultEditorForm

**Verify:** select hero → custom editor mounts. Switch to card → default form. Edit hero.tsx → HMR.

## Step 6: Custom fields

Complete the editor customization story.

**Changes:**

Types already done (Step 3 added `FieldMount`).

Discovery:
- `packages/gazetta/src/admin-api/routes/fields.ts` — NEW: `GET /api/fields` lists `fields/*.{ts,tsx}`
- `packages/gazetta/src/admin-api/index.ts` — register field routes

Loading in @rjsf:
- `packages/gazetta/src/editor/mount.tsx` — `buildUiSchema()` detects `meta.field` recursively (nested objects, arrays)
- Async widget wrapper: imports field module, mounts `FieldMount`

Reference:
- `examples/starter/fields/brand-color.tsx` — custom color picker with brand presets

**Verify:** banner template with `meta({ field: 'brand-color' })` → custom color picker renders in form.

## Step 7: Dev playground

Developer tool for building editors and fields in isolation.

**Changes:**
- `apps/admin/src/client/components/DevPlayground.vue` — NEW
- `apps/admin/src/client/router.ts` — add `/dev` route
- Sidebar: lists editors from API + fields from API
- Main area: mount selected with mock data (from JSON Schema defaults)
- Controls: theme toggle, value inspector, reset

**Verify:** `/admin/dev` → list editors/fields → select one → renders with mock data.

## Step 8: Project restructure

Move to the designed structure: `admin/`, `templates/`, `sites/`.

**Three sub-steps (each independently verifiable):**

8a. **Refactor loadSite callers to use options object** (non-breaking):
- Update 6 publish-rendered calls, 3 CLI calls, 1 app.ts call to use `loadSite({ siteDir, storage })`
- Remove deprecated positional overload
- Resolver uses `site.templatesDir` instead of `join(site.siteDir, 'templates')`

8b. **Restructure starter** (directory moves):
```
examples/starter/
  admin/                    # editors/ and fields/ move here
    package.json            # gazetta, react
    editors/hero.tsx
    fields/brand-color.tsx
  templates/
    package.json            # gazetta, react, zod
    hero/index.tsx
    ... (21 templates)
  sites/
    main/
      site.yaml
      fragments/
      pages/
  package.json              # workspaces: ["admin", "templates"]
  tsconfig.json             # base
  admin/tsconfig.json       # browser, @templates paths
  templates/tsconfig.json   # node
```

8c. **Update CLI for new structure:**
- Project root detection (walk up for workspaces config)
- Auto-detect site in `sites/`
- Pass `templatesDir = join(projectRoot, 'templates')` to `loadSite`
- Update Vite alias: `@editors → join(projectRoot, 'admin/editors')`
- Update `AdminAppOptions` with `templatesDir`
- Templates route: `join(projectRoot, 'templates')` instead of `join(siteDir, 'templates')` (5 call sites)
- Update 6 test files
- Update 7 doc files + 3 CI workflows

**Verify:** `npm run build && npm test`. `gazetta dev` works with new structure.

## Step 9: CLI improvements

Auto-detection, prompts, new commands.

**Changes:**
- Add `@clack/prompts` dependency
- Multi-site auto-detection: prompt if multiple, error in CI
- Multi-target auto-detection: same
- `gazetta init` scaffolds the new structure (admin/, templates/, sites/main/)
- Positional args: `gazetta publish production`, `gazetta dev my-site`
- `publishMode` logic: use field if set, else default from worker config
- `getPublishMode()` shared function

**Verify:** `gazetta dev` with one site → auto-detects. Multiple → prompts. CI → errors.

## Step 10: Production admin build

`gazetta build` command + import maps for production admin hosting.

**Changes:**
- `gazetta build` command in CLI:
  - Vite `build()` for admin SPA → `dist/admin/`
  - esbuild editors/fields with `external: ['react', 'react-dom', 'react-dom/client', 'gazetta/editor']`
  - Bundle React + gazetta/editor as standalone ESM → `dist/admin/deps/`
  - Generate import map → inject into `dist/admin/index.html`
  - Worker generation per target → `dist/workers/{target}/`
- `gazetta serve` serves built admin from `dist/admin/`

**Verify:** `gazetta build` → `dist/admin/` with import maps. `gazetta serve` → custom editors work.

## Step 11: Validate improvements

Complete the developer safety net.

**Changes:**
- Content vs schema validation (Zod)
- Orphaned editors (editor without template)
- Missing fields (schema references nonexistent field)
- Cross-workspace runtime imports
- Gazetta version mismatch across workspaces
- Target connectivity check

**Verify:** `gazetta validate` catches each error type.

## Step 12: Migrate existing sites

Update gazetta.studio and starter to final structure.

**Changes:**
- `sites/gazetta.studio/` → restructured with templates at project root
- Update deploy-site.yml CI workflow (paths trigger, command syntax)
- Update CLAUDE.md, README.md, CONTRIBUTING.md, getting-started.md
- Update docs/cloudflare.md, docs/self-hosted.md

**Verify:** CI passes. Deploy works. Docs match code.

## Summary

| Step | Ships | Enables |
|------|-------|---------|
| 1. Light mode | User-visible UX fix | Theme contract for editors |
| 2. Publish fix | Quality (bug fix) | Correct static publish |
| 3. Types | API foundation | All subsequent steps |
| 4. React peer dep | Dep isolation | Shared React in editors |
| 5. Custom editors | Developer feature | Editor ecosystem |
| 6. Custom fields | Developer feature | Field ecosystem |
| 7. Dev playground | Developer tool | Editor/field DX |
| 8. Restructure | Multi-site foundation | Workspace isolation |
| 9. CLI | Developer DX | Auto-detection, prompts |
| 10. Production build | Production admin | Hosted admin UI |
| 11. Validate | Developer safety | Error prevention |
| 12. Migrate sites | Complete transition | Everything matches docs |

## Risk reference

See the detailed gap analysis below for risks, cascades, and implementation details
discovered during planning. Key risks per step:

- **Step 4:** tsconfig `types: ["node"]` blocks React — add to types array
- **Step 5:** DefaultEditorForm extraction is a major refactor of mount.tsx
- **Step 8:** Only 5 template path call sites change + 6 test files. Not a rewrite.
- **Step 8:** Phase 1+2 coupling → steps 8a-8c avoid this by being incremental
- **Step 10:** Import maps never tested end-to-end — needs spike or integration test
