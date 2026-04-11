# Implementation Plan

Build Gazetta as designed. First slice delivers a complete user experience (editor customization).
Then sequential infrastructure steps. Types ship with their consumers.

## Step 0: UI verification infrastructure

Three approaches that give Claude eyes, assertions, and structural verification.

### 0a. MCP browser interactions

Add tools to the existing MCP dev server (`tools/mcp-dev/src/index.ts`):

- `click(testId)` — click element by `data-testid` attribute
- `type(testId, text)` — type into input by `data-testid`
- `wait(testId, timeout?)` — wait for element with `data-testid` to appear
- `hover(testId)` — hover over element by `data-testid`
- `get_text(testId)` — read text content (cheap, no vision)
- `get_aria()` — return ARIA tree snapshot of current page (cheap, structural)
- `screenshot` — already exists (expensive — use sparingly, only for visual verification)

Selectors use `data-testid` exclusively — not CSS classes or tag names (per team-preferences.md
rule #3). Stable across PrimeVue updates and CSS refactors.

**Cost awareness:** Screenshots consume vision tokens. Claude should prefer `get_text` and
`get_aria` for state verification. Use screenshots ONLY for visual quality checks (theming,
layout, colors). E2e tests and ARIA snapshots are text-based — zero vision cost.

### 0b. Playwright e2e test setup

- `playwright.config.ts` at project root — `webServer` starts `gazetta dev`
- `tests/e2e/` directory for e2e tests
- Test helper: start dev server, wait for ready, provide `page`
- First test: "admin loads, site tree shows pages" (proves setup works)
- ARIA snapshots for structural assertions (built into Playwright 1.59.1)

### 0c. Dev catalog page

`/admin/dev` route — renders every editor widget in isolation with hardcoded props.
Claude screenshots this page to verify visual quality after CSS changes.

Sections: text input (dark), text input (light), textarea, toggle, color picker, tags,
array items, rich text editor, each in both themes.

This is the dev playground (Step 5 in the plan) moved earlier because Claude needs it
for visual verification during Slice 1 development.

### Why these three

| Approach | Output | Vision cost | What it catches |
|----------|--------|:-----------:|-----------------|
| MCP `get_text` / `get_aria` | Text | None | State, structure, content |
| Playwright e2e + ARIA | Pass/fail text | None | Integration, behavior |
| MCP `screenshot` | Image | High | Visual quality (use sparingly) |
| Dev catalog + screenshot | Image | High | Per-widget appearance (rare, after CSS changes) |

**Default workflow:** make change → run e2e tests (text) → read pass/fail. Screenshot only
after theming/CSS changes that need visual verification.

Skip: jsdom component tests (can't test React-in-Vue mount), visual regression (Claude can't interpret pixel diffs).

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

### 1f. Documentation + gazetta.studio

Docs (same commit as the feature):
- `docs/getting-started.md` — add "Custom editors" section with example
- `docs/design.md` — update editor section with `admin/editors/` pattern
- `.claude/rules/custom-editors.md` — update with actual implementation details
- `.claude/rules/architecture.md` — add `admin/editors/` to package table
- `CLAUDE.md` — mention `admin/` directory

gazetta.studio (dogfooding):
- `sites/gazetta.studio/admin/editors/` — create a custom editor for one template
- Validates the feature works on a real site, not just the starter

### 1g. Tests

**E2e tests** (Playwright — programmatic verification):
```ts
test('theme toggle switches editor colors', ...)
test('custom editor loads for hero', ...)
test('default form loads for card', ...)
test('content edit via custom editor updates preview', ...)
```

**ARIA snapshots** (structural — text output Claude reads):
- Editor panel ARIA tree after selecting hero: shows custom editor content
- Editor panel ARIA tree after selecting card: shows @rjsf form fields

**Dev catalog screenshots** (visual — Claude sees images via MCP):
- `/admin/dev` showing all widgets in dark mode
- `/admin/dev` showing all widgets in light mode

### Verify Slice 1

Automated: `npx playwright test tests/e2e/editor.test.ts` — all pass
Visual: MCP screenshot of `/admin/dev` in both themes — looks correct
Docs: getting-started.md + gazetta.studio custom editor

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
- `sites/gazetta.studio/admin/fields/` — custom field on the real site
- Docs: add "Custom fields" section to getting-started.md, update custom-editors.md

## Step 4: React peer dependency

- `packages/gazetta/package.json` — react, react-dom → peerDependencies
- `packages/gazetta/tsconfig.json` — add react to types array
- Root `package.json` — react to devDependencies

## Step 5: Dev playground (extend Step 0c)

Step 0c creates a basic dev catalog for widget states. This step extends it:
- Sidebar listing custom editors + fields (from API)
- Dynamic import of selected editor/field, mount with mock data
- Theme toggle, value inspector, reset controls
- Full playground for developing editors in isolation

## Step 6: Project restructure

Three sub-steps (each verifiable):

6a. `loadSite` options object + `templatesDir` on `Site` interface (non-breaking refactor)
6b. Restructure starter: `admin/package.json`, `templates/package.json`, `sites/main/`, workspaces, tsconfigs
6c. CLI: project root detection, template path (5 call sites), `AdminAppOptions`, tests

Docs + site (same commits):
- Update CLAUDE.md, README.md, CONTRIBUTING.md (project structure)
- Update getting-started.md (init output, project structure)
- Update docs/cloudflare.md, docs/self-hosted.md (deployment paths)
- Update `.github/workflows/deploy-site.yml` (paths trigger + command syntax)
- Restructure `sites/gazetta.studio/` to match new structure

## Step 7: CLI improvements

- `@clack/prompts` for interactive prompts
- Multi-site/target auto-detection
- `gazetta init` scaffolds new structure
- Positional args

## Step 8: Production admin build

- Research Vite build vs import maps first
- `gazetta build` command
- `gazetta serve` serves built admin

## Step 9: Validate + migrate

- Content vs schema validation, orphaned editors, missing fields
- Verify gazetta.studio works end-to-end with all changes
- Final doc pass — all docs match current code

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
