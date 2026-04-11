# Implementation Plan

Build Gazetta as designed. Each step ships value AND builds foundation for the next.
Types ship with their consumers, not ahead of them.

## Step 1: Editor theming (light mode)

User-visible value. Proves the theme contract for custom editors.

**Changes:**
- `packages/gazetta/src/editor/mount.tsx` — replace hardcoded hex with CSS variables
- `apps/admin/src/client/components/EditorPanel.vue` — set CSS variables from theme store

**14 color variables:**

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

## Step 2: Publish fix + publishMode

Fix Known Gap #1 and add the publishMode type together. One coherent change.

**Changes:**
- `packages/gazetta/src/types.ts` — add `publishMode?: 'esi' | 'static'` to `TargetConfig`
- `packages/gazetta/src/types.ts` — add `locale?: string`, `baseUrl?: string` to `SiteManifest`
- `packages/gazetta/src/manifest.ts` — parse new fields from site.yaml
- Shared function:
  ```ts
  function getPublishMode(target: TargetConfig): 'esi' | 'static' {
    return target.publishMode ?? (target.worker ? 'esi' : 'static')
  }
  ```
- `packages/gazetta/src/cli/index.ts` — use `getPublishMode()` instead of `!targetConfig?.worker`
- `packages/gazetta/src/admin-api/routes/publish.ts` — use `getPublishMode()` (fixes bug)
- Add admin API publish tests

**Verify:** publish from admin UI to static target → assembled HTML, not ESI.

## Step 3: Custom editors in dev mode

Types (`EditorMount` prop changes) ship WITH the implementation, not ahead.
Editors live in `admin/editors/` from the start — no later move needed.

**Type changes (in this step):**
- `packages/gazetta/src/types.ts` — add `schema` and `theme` to `EditorMount.mount()` props
- Remove `editor?` from `TemplateModule`

**File structure:**
```
examples/starter/
  admin/                     # NEW directory (no package.json yet — just editors)
    editors/
      hero.tsx               # custom editor
  templates/
  fragments/
  pages/
```

**Editor discovery:**
- `packages/gazetta/src/template-loader.ts` — add `hasEditorFile(storage, editorsDir, name)`
- `packages/gazetta/src/admin-api/routes/templates.ts` — schema response includes `hasEditor`

**Vite alias:**
- `packages/gazetta/src/cli/index.ts` — inject `resolve.alias: { '@editors': join(siteDir, 'admin/editors') }` + `server.fs.allow`

**Admin UI:**
- `apps/admin/src/client/composables/useEditorMount.ts` — pass `schema` and `theme`
- `apps/admin/src/client/components/EditorPanel.vue` — pass `schema` and `theme`, branch custom/default
- `apps/admin/src/client/stores/editing.ts` — `customEditorMount` ref, load via dynamic import

**DefaultEditorForm extraction:**
- `packages/gazetta/src/editor/mount.tsx` — extract @rjsf Form as `DefaultEditorForm`
- Export from `gazetta/editor`

**Reference editor:**
- `examples/starter/admin/editors/hero.tsx` — live preview + embedded DefaultEditorForm

**Verify:** hero → custom editor. card → default form. Edit hero.tsx → HMR.

## Step 4: Custom fields

`FieldMount` type ships WITH the implementation.

**Type changes (in this step):**
- `packages/gazetta/src/types.ts` — add `FieldMount` interface

**Discovery:**
- `packages/gazetta/src/admin-api/routes/fields.ts` — NEW: `GET /api/fields`
- `packages/gazetta/src/admin-api/index.ts` — register field routes

**Loading in @rjsf:**
- `packages/gazetta/src/editor/mount.tsx` — `buildUiSchema()` detects `meta.field` recursively
- Async widget wrapper: imports field module, mounts `FieldMount`

**File structure:**
```
examples/starter/
  admin/
    editors/hero.tsx
    fields/                  # NEW
      brand-color.tsx
```

**Verify:** banner with `meta({ field: 'brand-color' })` → custom picker renders.

## Step 5: React peer dependency

Decouple after custom editors are proven working.

**Changes:**
- `packages/gazetta/package.json` — react, react-dom → peerDependencies
- `packages/gazetta/tsconfig.json` — add `"react"`, `"react-dom"` to types array
- `package.json` (root) — add react to devDependencies

All React-dependent packages already use peer deps (confirmed: @rjsf/core, @tiptap/react, @hello-pangea/dnd).

**Verify:** `npm install && npm run build && npm test && npm ls react` (one copy).

## Step 6: Dev playground

Developer tool for building editors/fields in isolation.

**Changes:**
- `apps/admin/src/client/components/DevPlayground.vue` — NEW
- `apps/admin/src/client/router.ts` — add `/dev` route
- Sidebar: editors + fields from API
- Main area: mount selected with mock data
- Controls: theme toggle, value inspector, reset

**Verify:** `/admin/dev` → select editor → renders with mock data.

## Step 7: Project restructure

Three sub-steps, each independently verifiable.

**7a. loadSite options object** (non-breaking refactor):
- `packages/gazetta/src/site-loader.ts` — add `templatesDir` to `Site` interface, overloaded `loadSite`
- `packages/gazetta/src/resolver.ts` — use `site.templatesDir` (2 changes)
- `packages/gazetta/src/publish-rendered.ts` — use `site.templatesDir` (1 change)
- Update callers to options form, remove deprecated overload

**7b. Restructure starter** (directory moves):
```
examples/starter/
  package.json               # workspaces: ["admin", "templates"]
  admin/
    package.json             # gazetta, react
    tsconfig.json            # browser, @templates paths
    editors/hero.tsx
    fields/brand-color.tsx
  templates/
    package.json             # gazetta, react, zod
    tsconfig.json            # node
    hero/index.tsx ... (21 templates)
  sites/main/
    site.yaml
    fragments/
    pages/
```

**7c. CLI for new structure:**
- Project root detection
- Template path: `join(projectRoot, 'templates')` (5 call sites)
- `AdminAppOptions` + `templatesDir`
- Update 6 test files, 7 docs, 3 CI workflows

**Verify:** `npm run build && npm test`. `gazetta dev` works.

## Step 8: CLI improvements

**Changes:**
- `@clack/prompts` for interactive prompts
- Multi-site/target auto-detection + prompts (CI: error)
- `gazetta init` scaffolds new structure
- Positional args: `gazetta publish production my-site`

**Verify:** auto-detection prompts locally, fails in CI.

## Step 9: Production admin build

**Research first:** Vite build (code splitting, automatic React dedup) vs import maps
(manual ESM bundles, runtime resolution). Spike both approaches before implementing.

**Changes (after research):**
- `gazetta build` command
- Admin SPA build
- Editor/field bundling with shared React
- Worker generation per target (already implemented in `gazetta deploy`)
- `gazetta serve` serves built admin

**Verify:** `gazetta build && gazetta serve` → custom editors work in production.

## Step 10: Validate + migrate sites

**Validate improvements:**
- Content vs schema validation
- Orphaned editors, missing fields
- Cross-workspace imports, version mismatches
- Target connectivity

**Migrate existing sites:**
- `sites/gazetta.studio/` restructured
- CI workflows updated
- All docs updated

**Verify:** `gazetta validate` catches errors. CI passes. Docs match code.

## Ordering rationale

Light mode first (theming is foundation for editors) → custom editors (highest leverage,
validates architecture) → everything else extends proven patterns.

| Step | What | Why this order |
|------|------|----------------|
| 1 | Light mode | Foundation — theme contract that all editors/fields use |
| 2 | Publish fix + publishMode | Independent fix, ships quality |
| 3 | Custom editors | Highest leverage — validates Vite alias, dynamic import, DefaultEditorForm |
| 4 | Custom fields | Extends proven editor infrastructure |
| 5 | React peer dep | After editors proven, before npm publish |
| 6 | Dev playground | DX tool — needs editors/fields to exist first |
| 7 | Restructure | Multi-site — all features work, now organize |
| 8 | CLI | DX improvements on stable base |
| 9 | Production build | Research Vite vs import maps, then implement |
| 10 | Validate + migrate | Complete the vision |
