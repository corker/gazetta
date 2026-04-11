# Implementation Plan

Build Gazetta as designed. First slice delivers a complete user experience (editor customization).
Then sequential infrastructure steps. Types ship with their consumers.

## Principle: UX before code

Before implementing any step, walk through the experience from each affected user's perspective.
Design the best UX solution first, then implement.

| User | What they care about | When to consider |
|------|---------------------|------------------|
| **Content author** | Editing experience — forms, preview, save/discard, dark/light | Every editor change |
| **Template developer** | Creating editors/fields — file structure, API, HMR, DX | Custom editor/field features |
| **Site developer** | Project setup, CLI, deploy, targets | Structure, CLI, init changes |
| **Contributor** | Clone, run, test, submit PR | Testing, docs, onboarding |

For each step:
1. **Research** — how do other products solve this? Study design, styles, visuals, interactions
   in Sanity Studio, Payload CMS, Storyblok, Notion, Linear, and other relevant tools.
2. **Design** — describe what each affected user sees, clicks, and types. Sketch the interaction.
3. **Simplify** — find friction points, remove unnecessary steps, question every element.
4. **Implement** — build the simplest correct solution that matches the designed experience.

## Step 0: UI verification infrastructure

Three approaches that give Claude eyes, assertions, and structural verification.

### 0a. MCP browser interactions

Add tools to the existing MCP dev server (`tools/mcp-dev/src/index.ts`):

- `goto(url)` — navigate to URL (separate from screenshot)
- `click(testId, selector?)` — click by `data-testid` (primary) or CSS selector (fallback for PrimeVue internals)
- `type(testId, text)` — type into input by `data-testid`
- `wait(testId, timeout?)` — wait for element with `data-testid` to appear
- `hover(testId)` — hover by `data-testid`
- `get_text(testId)` — read text content (cheap, no vision)
- `get_attribute(testId, attr)` — read attribute value (cheap)
- `get_aria()` — return full page ARIA tree as YAML (cheap, structural) — uses Playwright `page.ariaSnapshot()`
- `screenshot(fullPage?)` — capture current page state WITHOUT navigating (expensive — use sparingly)

**Selector strategy:** `data-testid` as primary (stable). CSS selector as fallback for
PrimeVue internal elements we can't add testids to. No class-based selectors.

**Page persistence:** The page stays open between tool calls. `goto` navigates. `click`/`type`
interact with the current page. `screenshot` captures without navigating. This enables:
`goto('/admin')` → `click('site-page-home')` → `wait('editor-panel')` → `get_text('editor-panel')`.

**Cost awareness:** `get_text`, `get_aria`, `get_attribute` are text-only — zero vision cost.
`screenshot` is expensive (vision tokens). Default workflow: interact via `click`/`type`,
verify via `get_text`/`get_aria`. Screenshot only for visual quality checks after CSS changes.

### 0b. Playwright e2e test setup

- `playwright.config.ts` at project root — `webServer` starts `gazetta dev`
- `tests/e2e/` directory for e2e tests
- Test helper: start dev server, wait for ready, provide `page`
- First test: "admin loads, site tree shows pages" (proves setup works)
- ARIA snapshots for structural assertions (built into Playwright 1.59.1)

### 0c. Dev catalog page (minimal)

`/admin/dev` route — static page rendering editor widgets with hardcoded props.
~100 lines of Vue. No sidebar, no dynamic import, no controls (those come in Step 5).

Sections: text input, textarea, toggle, color picker, tags, array items, rich text.
Each widget rendered with example content. Page uses the current theme (dark/light
toggle in toolbar still works).

Claude screenshots this page after CSS changes to verify visual quality. Used rarely —
only when changing mount.tsx STYLES.

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
