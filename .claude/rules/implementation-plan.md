# Implementation Plan

Build Gazetta as designed. First slice delivers a complete user experience (editor customization).
Then sequential infrastructure steps. Types ship with their consumers.

## Slice 1: "I can customize my template's editor"

The complete editor customization experience — everything a template developer needs.
Theming + custom editor loading + DefaultEditorForm + reference editor. One deliverable.

### 1a. Editor theming

- `packages/gazetta/src/editor/mount.tsx` — replace hardcoded hex with CSS variables
- `apps/admin/src/client/components/EditorPanel.vue` — set CSS variables from theme store

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

### 1b. EditorMount type changes

- `packages/gazetta/src/types.ts` — add `schema` and `theme` to `EditorMount.mount()` props, remove `editor?` from `TemplateModule`
- `apps/admin/src/client/composables/useEditorMount.ts` — pass `schema` and `theme`
- `apps/admin/src/client/components/EditorPanel.vue` — pass `schema` and `theme`
- `packages/gazetta/src/editor/mount.tsx` — accept `schema` and `theme` in mount props

### 1c. DefaultEditorForm extraction

- `packages/gazetta/src/editor/mount.tsx` — extract @rjsf Form wrapper as `DefaultEditorForm` React component
- Export from `gazetta/editor` alongside `createEditorMount`
- Custom editors can embed: `<DefaultEditorForm schema={schema} content={content} onChange={onChange} theme={theme} />`

### 1d. Custom editor discovery + loading

File structure:
```
examples/starter/
  admin/                     # NEW directory
    editors/
      hero.tsx               # custom editor
  templates/
  fragments/
  pages/
```

Discovery:
- `packages/gazetta/src/template-loader.ts` — add `hasEditorFile(storage, editorsDir, name)`
- `packages/gazetta/src/admin-api/routes/templates.ts` — schema response includes `hasEditor`

Vite alias:
- `packages/gazetta/src/cli/index.ts` — inject `resolve.alias: { '@editors': join(siteDir, 'admin/editors') }` + `server.fs.allow`

Admin UI:
- `apps/admin/src/client/stores/editing.ts` — `customEditorMount` ref, load via `import('@editors/{name}.tsx')`
- `apps/admin/src/client/components/EditorPanel.vue` — if custom editor, use it; else default

### 1e. Reference editor

- `examples/starter/admin/editors/hero.tsx` — live preview + embedded DefaultEditorForm, uses CSS variables for theme-aware styling

### Verify Slice 1

1. Toggle dark/light → editor follows theme
2. Select hero → custom editor mounts with live preview + default form
3. Edit content via custom editor → preview updates
4. Switch to card → default @rjsf form
5. Edit `admin/editors/hero.tsx` → Vite HMR reloads
6. Both dark and light mode work in custom editor

---

## Step 2: Publish fix + publishMode

Independent bug fix + type addition.

- `packages/gazetta/src/types.ts` — add `publishMode?: 'esi' | 'static'` to `TargetConfig`, add `locale?`, `baseUrl?` to `SiteManifest`
- `packages/gazetta/src/manifest.ts` — parse new fields
- Shared `getPublishMode(target)` function
- Fix `admin-api/routes/publish.ts` to use `getPublishMode()`
- Add publish tests (none exist)

## Step 3: Custom fields

- `packages/gazetta/src/types.ts` — add `FieldMount` interface
- `packages/gazetta/src/admin-api/routes/fields.ts` — NEW: `GET /api/fields`
- `packages/gazetta/src/editor/mount.tsx` — `buildUiSchema()` detects `meta.field` recursively, async widget wrapper
- `examples/starter/admin/fields/brand-color.tsx` — reference field

## Step 4: React peer dependency

- `packages/gazetta/package.json` — react, react-dom → peerDependencies
- `packages/gazetta/tsconfig.json` — add react to types array
- Root `package.json` — react to devDependencies

## Step 5: Dev playground

- `apps/admin/src/client/components/DevPlayground.vue` — NEW
- `apps/admin/src/client/router.ts` — `/dev` route
- Sidebar listing editors/fields, main area with mock data, theme toggle

## Step 6: Project restructure

Three sub-steps (each verifiable):

6a. `loadSite` options object + `templatesDir` on `Site` interface (non-breaking refactor)
6b. Restructure starter: `admin/package.json`, `templates/package.json`, `sites/main/`, workspaces, tsconfigs
6c. CLI: project root detection, template path (5 call sites), `AdminAppOptions`, tests, docs, CI

## Step 7: CLI improvements

- `@clack/prompts` for interactive prompts
- Multi-site/target auto-detection
- `gazetta init` scaffolds new structure
- Positional args

## Step 8: Production admin build

- Research Vite build vs import maps first
- `gazetta build` command
- `gazetta serve` serves built admin

## Step 9: Validate + migrate sites

- Content vs schema validation, orphaned editors, missing fields
- Migrate `sites/gazetta.studio/`, update CI/docs

## Ordering rationale

| Step | Why this order |
|------|----------------|
| Slice 1 | Highest leverage — validates architecture, delivers complete user experience |
| 2. Publish fix | Independent, ships quality |
| 3. Custom fields | Extends proven editor infrastructure from Slice 1 |
| 4. React peer dep | After editors proven, before npm publish |
| 5. Dev playground | DX tool — needs editors/fields to exist |
| 6. Restructure | All features work, now organize for multi-site |
| 7. CLI | DX improvements on stable base |
| 8. Production build | Research first, then implement |
| 9. Validate + migrate | Complete the vision |
