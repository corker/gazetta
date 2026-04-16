---
paths:
  - "**/*.test.ts"
  - "tests/e2e/**"
  - "packages/gazetta/tests/**"
  - "apps/admin/tests/**"
---

# Testing Plan

Active plan for expanding test coverage and restructuring e2e. Synthesised from a
codebase audit (2026-04-16).

**Status legend:** ☐ todo · ◐ in progress · ✓ done

When a task is actively being worked, link a GitHub issue: `☐ [#123] task`.
When the whole plan is complete, change frontmatter `paths:` to
`NEVER_MATCH_AUTO_LOAD` to archive (follow [implementation-plan.md](./implementation-plan.md) pattern).

---

## Part 1 — Coverage gaps

### Priority 1 — real, high-value

#### ☐ 1.1 Vue component tests for admin SFCs

No Vue component mount tests exist. [apps/admin/tests/](../../apps/admin/tests/) covers
stores, API, and docker only — no SFC mounts (verified: zero `mount(`/`createApp` across
all `*.test.ts`).

**Targets:**
- [PublishPanel.vue](../../apps/admin/src/client/components/PublishPanel.vue) — absorbed
  PublishDialog + FetchDialog + ChangesDrawer; largest behavioral surface
- [ActiveTargetIndicator.vue](../../apps/admin/src/client/components/ActiveTargetIndicator.vue)
  — env-chrome switcher with unsaved-guard integration
- [ComponentTree.vue](../../apps/admin/src/client/components/ComponentTree.vue) — drag-reorder,
  add/remove
- [SyncIndicators.vue](../../apps/admin/src/client/components/SyncIndicators.vue) — relative
  sync state

**Stack:** `@vue/test-utils` (stable, last release May 2024) + `@pinia/testing` with
`createTestingPinia({ stubActions: false })`.

**Assertions:**
- Pickers wire to stores
- Prod confirmation gates on `environment: production`
- Read-only targets disable save
- Env chrome renders per environment value

**Estimate:** 1-2 days.

---

#### ☐ 1.2 Direct unit tests for sidecars.ts

[packages/gazetta/src/sidecars.ts](../../packages/gazetta/src/sidecars.ts) — central
content-addressing I/O module, no dedicated test file (verified: grep for `readSidecars`,
`listSidecars` in tests returns zero matches).

**Stack:** in-memory `Map<string, string>`-backed `StorageProvider` fake.

**Assertions:**
- `readSidecars` returns `null` for missing dir
- Parses `.hash`, `.uses-`, `.tpl-` correctly
- `listSidecars` handles empty dirs
- Writes are idempotent

**Estimate:** ~0.5 day.

---

#### ☐ 1.3 Property-based tests for hash.ts helpers

Missing coverage:
- `encodeRefName` / `decodeRefName`
- `usesSidecarNameFor` / `parseUsesSidecarName`
- `templateSidecarNameFor` / `parseTemplateSidecarName`

(Verified: grep across all `*.test.ts` returns zero matches.)

**Stack:** `fast-check`.

**Properties:**
- `decodeRefName(encodeRefName(x)) === x` for arbitrary strings
- Parse/generate round-trips for each sidecar kind
- Non-collision between the three sidecar regexes

**Skip:** `hashManifest` key-order invariance — already example-tested at
[hash.test.ts:55-68](../../packages/gazetta/tests/hash.test.ts#L55-L68).

**Estimate:** ~0.5 day.

---

#### ☐ 1.4 Fault-injection tests for history + publish

[history-recorder.ts](../../packages/gazetta/src/history-recorder.ts),
[publish.ts](../../packages/gazetta/src/publish.ts),
[publish-rendered.ts](../../packages/gazetta/src/publish-rendered.ts) — no failure-mode
tests.

**Stack:** `StorageProvider` decorator that fails the Nth call with configurable errors.

**Assertions:**
- History doesn't corrupt under mid-write failure
- Concurrent saves don't lose revisions
- Retention eviction is atomic

**Why high-stakes:** history is new (branch `history-undo`); soft-undo claims in
design-publishing.md require tested failure semantics.

**Estimate:** ~1 day.

---

### Priority 2 — good value, lower urgency

#### ☐ 2.1 Storage provider conformance parity

**Current state (verified in [docker.test.ts](../../apps/admin/tests/docker.test.ts) and
[filesystem-provider.test.ts](../../packages/gazetta/tests/filesystem-provider.test.ts)):**

| Provider | Tests | Shape |
|----------|-------|-------|
| Filesystem | 9 direct CRUD + 2 publish-level | Strong |
| S3 (MinIO) | 8 direct CRUD + 4 rendered-publish + 6 edge-composition | Very strong |
| Azure (Azurite) | 3 publish-level | **Weakest — no direct CRUD battery** |
| R2 via S3 API | Covered implicitly via MinIO (same `createS3Provider` code path) | Indirect but valid |
| R2 via REST API (wrangler auth) | 0 | Gap — local-dev-only path per configurations.md |

**Approach:**
1. Extract S3 CRUD battery at
   [docker.test.ts:51-110](../../apps/admin/tests/docker.test.ts#L51-L110) into a shared
   `conformanceTests(name, getProvider)` function
2. Run against filesystem, S3 (MinIO), Azure (Azurite)
3. Optional: add R2 REST-API coverage (harder — needs Cloudflare API mock or test account)

**Not a rule #2 tension.** `DockerComposeEnvironment` from the `testcontainers` npm package
is a legitimate testcontainers approach — it manages lifecycle programmatically via
`up()`/`down()`. Rule #2 discourages raw shell `docker-compose up`, which isn't happening.

**Cleanup:** remove unused `@testcontainers/azurite` from
[apps/admin/package.json](../../apps/admin/package.json) — installed, imported nowhere.

**Estimate:** ~0.5-1 day.

---

#### ✓ 2.2 Documented-behavior tests from operations.md

Audited the "testable claims" list against the source. Three of six were
**aspirational entries in operations.md** — documented as current but unimplemented.
Those have been corrected in operations.md rather than tested. Landed tests for the
three real claims:

**Tested (real):**
- Circular fragment reference detection — [resolver.test.ts](../../packages/gazetta/tests/resolver.test.ts)
  added 4 tests: self-reference, 2-hop cycle, 3-hop cycle, diamond-without-cycle (no false positive)
- Keyboard shortcut `Ctrl/Cmd+S` saves — [editor.test.ts](../../tests/e2e/editor.test.ts)
  added 3 e2e tests: Control+S, Meta+S, clean-form no-op
- Keyboard shortcut `Ctrl/Cmd+Z` undo / `Shift+Z` redo — added e2e tests against
  the default `@rjsf` form editor (implementation lives at
  [packages/gazetta/src/editor/mount.tsx](../../packages/gazetta/src/editor/mount.tsx)
  lines 869-914, scoped to field-level edit history with a 50-entry stack)
- `Escape` closes dialogs — already covered by the existing `Escape key behavior`
  describe block in editor.test.ts
- Explicit `environment: production` confirmation — already covered by
  [PublishPanel.test.ts](../../apps/admin/tests/PublishPanel.test.ts) (PR #151)

**Corrected in operations.md (not implemented — documentation was aspirational):**
- Render timeouts (10s dev / 30s publish) — marked as future work; today a hung
  template hangs the process
- 20-level nesting-depth warning — marked as future `gazetta validate` work
- Connectivity precheck before publish — marked as future; today failures surface
  through the underlying SDK error when the first write or list fails

---

#### ◐ 2.3 Accessibility scans in e2e

Landed via `@axe-core/playwright` in [tests/e2e/a11y.test.ts](../../tests/e2e/a11y.test.ts).
Four surfaces scanned (site tree, editor view, Publish panel, active-target switcher).

**Baseline allowlist pattern:** 5 known violations tracked in the test file's `BASELINE`
array — each entry names a rule id + the reason it's deferred. New violations not in the
allowlist fail CI; fixes remove entries. Known debt at introduction (2026-04-16):

- `color-contrast` — tinted state colors below 4.5:1 in dark mode
- `button-name` — icon-only buttons need aria-label audit
- `label` — rjsf inputs rendering without labels
- `frame-title` — preview iframe missing dynamic title
- `nested-interactive` — PrimeVue Checkbox inside clickable row

**Remaining work:** burn down the BASELINE entries as fixes land.

**Skipped:** Vitest-level a11y via `@chialab/vitest-axe` — e2e coverage is sufficient.

---

### Priority 3 — optional

#### ✓ 3.1 Mutation testing (nightly, not per-commit)

Landed via StrykerJS v9.6.1 + `@stryker-mutator/vitest-runner` + `@stryker-mutator/typescript-checker`.

**Scope:** `packages/gazetta/src/{history-*,admin-api/**,publish*}` — see
[stryker.config.json](../../packages/gazetta/stryker.config.json).

**Config:**
- `inPlace: true` — tests reference `../../examples/starter` and other cross-workspace
  paths; Stryker's default sandbox orphans those. In-place mode mutates the real files
  and restores them from `.stryker-tmp/` on exit.
- `thresholds.break: 0` — no enforcement yet. Baseline needs to stabilise first.
- `reporters`: html + clear-text + progress

**Nightly workflow:** [.github/workflows/mutation.yml](../../.github/workflows/mutation.yml)
runs at 03:00 UTC on `schedule` + `workflow_dispatch` (for branch runs). `continue-on-error`
means mutation results are signal, not gate. Report uploaded as artifact (30-day retention).

**Smoke baseline:** `hash.ts` alone scored **70.27%** in the initial run — surfaced one
real survived mutant (removing `.sort()` on [hash.ts:111](../../packages/gazetta/src/hash.ts#L111)
went undetected by existing example tests). Worth investigating in a follow-up.

**Runtime:** ~7 min for `hash.ts` alone (65 mutants). Full target set likely hours —
this is nightly-only for a reason. When raising `thresholds.break`, do it gradually:
60 → 70 → 80 as real coverage gaps get fixed.

---

#### ◐ 3.2 Contract tests via shared Zod schemas

First slice landed: `POST /api/pages` now has a Zod schema in
[packages/gazetta/src/admin-api/schemas/pages.ts](../../packages/gazetta/src/admin-api/schemas/pages.ts),
exposed via a new subpath export `gazetta/admin-api/schemas`. Server validates with
`safeParse()`, client derives request/response types via `z.infer`.

**Pattern established:**
- Schemas live under `src/admin-api/schemas/{endpoint}.ts`
- Re-exported from `schemas/index.ts` (barrel)
- Subpath export keeps Hono + storage providers off the client's type graph
- Contract test at
  [apps/admin/tests/api-contract.test.ts](../../apps/admin/tests/api-contract.test.ts)
  asserts value-level conformance (compile-time drift is already caught by `z.infer`)

**Drift caught while landing:** The client's `createPage` body type was `{ name, template }`
but the server already accepted an optional `content` field. The schema made this visible
and the migration widened the client type to match.

**Follow-ups (per-endpoint migration):** The remaining 20+ routes still use hand-rolled
shape checks. Each migration is mechanical — same pattern, one PR per route group.
Good starter tickets.

**Skip:** Pact — overkill for single consumer/provider.

**Estimate:** ~1 day, mostly refactoring.

---

## Part 2 — E2E structure

### Current state (measured)

| File | Lines | Tests | Describes |
|------|-------|-------|-----------|
| [editor.test.ts](../../tests/e2e/editor.test.ts) | 1,134 | 59 | 26 |
| [production.test.ts](../../tests/e2e/production.test.ts) | 29 | 3 | — |
| [production-static.test.ts](../../tests/e2e/production-static.test.ts) | 17 | 2 | — |
| [production-esi.test.ts](../../tests/e2e/production-esi.test.ts) | 36 | 4 | — |
| [fixtures.ts](../../tests/e2e/fixtures.ts) | 176 | — | — |

**Problem:** editor.test.ts mixes 26 unrelated describes. The Publish panel block alone is
245 lines (largest cohesive block).

**What works — keep unchanged:**
- Worker-scoped temp site copy (team-preferences rule #10)
- Console-error guard with opt-out annotation
- `data-testid` discipline (rule #3)
- Azure-blob → filesystem patching for CI

---

### Target structure

```
tests/e2e/
├── fixtures.ts                 # unchanged
├── pages/                      # Page Objects (selective)
│   ├── AdminShell.ts
│   ├── SiteTree.ts
│   ├── ComponentTree.ts
│   ├── EditorPanel.ts
│   └── PublishPanel.ts
├── scenarios/                  # user-journey tests (5-10 files)
│   ├── first-edit-and-save.spec.ts
│   ├── publish-to-staging.spec.ts
│   ├── promote-staging-to-prod.spec.ts
│   ├── undo-a-publish.spec.ts
│   └── switch-active-target.spec.ts
├── features/                   # split editor.test.ts by describe
│   ├── toolbar.spec.ts
│   ├── theme.spec.ts
│   ├── component-tree-reorder.spec.ts
│   ├── publish-panel-ui.spec.ts
│   ├── unsaved-guard.spec.ts
│   ├── custom-editors.spec.ts
│   └── history.spec.ts
├── matrices/                   # parameterized across natural axes
│   ├── environments.spec.ts    # env × editable
│   └── target-types.spec.ts    # static × dynamic
└── production/
    ├── static.spec.ts
    ├── esi.spec.ts
    └── build.spec.ts
```

---

### Matrix axes (domain-natural)

| Axis | Values | Source |
|------|--------|--------|
| Target type | static, dynamic | design-concepts.md |
| Environment | local, staging, production, unset | design-concepts.md |
| Editable | yes, no | design-concepts.md |
| Storage provider | filesystem, R2, S3, azure-blob | architecture.md |

Env × editable × type = 16 combinations. Many admin behaviors differ across them.

**Example:**

```ts
const envMatrix = [
  { env: 'local', editable: true,  chrome: 'neutral', confirm: false },
  { env: 'staging', editable: false, chrome: 'amber',   confirm: false },
  { env: 'production', editable: false, chrome: 'red',  confirm: true  },
  { env: 'production', editable: true,  chrome: 'red',  confirm: true  },
]
for (const row of envMatrix) {
  test(`${row.env} ${row.editable ? 'editable' : 'readonly'}`, async ({ page, testSite }) => {
    await configureTarget(testSite, row)
    // parameterized body
  })
}
```

---

### Top user journeys (scenario candidates)

Derived from design-publishing.md and design-editor-ux.md — pick the 5-10 that matter most:

1. First edit → save
2. Save → publish to staging
3. Promote staging → prod (with confirmation)
4. Hotfix: publish prod → local
5. Undo a publish (transient Undo)
6. Rollback via history panel
7. Switch active target (preserves context)
8. Switch with unsaved edits (guard fires)
9. Multi-destination fan-out publish
10. Delete-and-recreate target

Write scenarios as Given/When/Then prose comments over POM method calls — no Cucumber.

---

### POM — selective adoption

| Surface | POM value |
|---------|-----------|
| `PublishPanel` | High — source + destinations + items + actions; in most scenarios |
| `SiteTree` | High — used in every test |
| `ComponentTree` | High — reorder/add/remove mechanics |
| Everything else | Keep inline; adopt POM when reuse hurts |

---

### Phased migration

#### ✓ Phase 1 — Reorganize (zero behavior change)

Landed. Split the old 1,246-line `editor.test.ts` (64 tests, 27 describes) into 12 feature
files + a shared `helpers.ts` for `openEditor`. Test count preserved exactly: 64 before, 64
after. All tests pass.

**New layout** (flat under `tests/e2e/`, naming `.spec.ts` for the new files):

- `smoke.spec.ts` — admin loads, toolbar tooltips
- `theme.spec.ts` — user theme, theme toggle, toast
- `site-tree.spec.ts` — dirty indicators
- `editor.spec.ts` — default editor, custom editor, custom field, rapid selection
- `unsaved-guard.spec.ts` — unsaved dialog, component stashing, escape key
- `deep-linking.spec.ts` — deep links + dev playground deep links
- `dev-playground.spec.ts` — dev playground
- `component-ops.spec.ts` — add/move/remove
- `publish.spec.ts` — publish panel, fragment blast radius, save labeling, sync grouping
- `target-switch.spec.ts` — preserves preview / missing item / unsaved edits
- `history.spec.ts` — undo last save + history panel
- `keyboard.spec.ts` — keyboard shortcuts

Deferred subdirectory layout (`scenarios/`, `features/`, `matrices/`, `production/`) — flat
under `tests/e2e/` was simpler for Phase 1. Subdirectories can come in later phases as the
suite grows; today's 12 files are fine flat.

playwright.config.ts `testMatch` extended to both `.test.ts` and `.spec.ts`. Production
files stay on `.test.ts` and are excluded via `testIgnore`.

---

#### ◐ Phase 2 — Page Objects

First POM landed: [PublishPanelPom](../../tests/e2e/pages/PublishPanel.ts). Covers the
full Publish-panel surface — opening, source/destinations, items, publish action (with
prod confirmation variant), status surfaces (confirm banner, invalid-templates, progress,
per-target results). Migrated the full `Publish panel` describe in
[publish.spec.ts](../../tests/e2e/publish.spec.ts) — 14 tests, test count unchanged,
pass rate unchanged.

**Pattern:** POMs live under `tests/e2e/pages/`, one file per surface. Composition, no
inheritance — each POM takes a `page` in the constructor. Methods expose user-level
actions; getters expose locators; assertions stay in the tests. Matches
[Playwright POM docs](https://playwright.dev/docs/pom).

**Follow-ups:** SiteTreePom + ComponentTreePom — deferred to PRs that actually migrate
tests using them. Building POMs without consumers is dead code; adding a POM with its
first migration keeps the API honest.

---

#### ☐ Phase 3 — Scenarios

- Write 5-10 journey tests using POMs
- Additions, not replacements — feature tests cover unit behavior, scenarios cover intent

**Estimate:** ~1-2 days.

---

#### ☐ Phase 4 — Matrix tests

- Env × editable for chrome + confirmation
- Target-type for save-render vs save-fast

**Estimate:** ~1 day.

---

## Explicit non-recommendations

| Skip | Why |
|------|-----|
| Visual regression testing | css-theming.md and design-decisions.md explicitly defer; reintroduction criteria not met |
| Playwright Vue component testing | Experimental; Vitest + Vue Test Utils covers it |
| `vitest-axe` (original) | v0.1.0, last published 3 years ago — unmaintained |
| Pact for contracts | Overkill for single consumer/provider |
| Vitest `bench` | Experimental, no SemVer guarantee — adopt only with specific perf motivation |
| Cucumber / playwright-bdd | Intent gets split between feature files and step defs — worse maintainability for solo dev |
| Screenplay pattern | Designed for multi-team / multi-actor scaling |
| External CSV/JSON test data | TypeScript matrices are type-safe |
| Global setup hooks | Worker-scoped fixture already handles per-worker setup |
| Named workflow profiles | Rejected by design-decisions.md #15 |

---

## Cleanup items (orthogonal)

- ☐ Remove dead `@testcontainers/azurite` dep from
  [apps/admin/package.json](../../apps/admin/package.json) — installed, imported nowhere
- ☐ Fill formatter/linter placeholders in [node/conventions.md](./node/conventions.md)

---

## Suggested sequence

| Week | Coverage work | E2E work |
|------|---------------|----------|
| 1 | Priority 1.1-1.3 in parallel (Vue tests, sidecars, PBT) | Phase 1 (file moves, no-risk) |
| 2 | Priority 1.4 (fault injection) | Phase 2 (POMs) |
| 3 | Priority 2.1 (Azure CRUD parity) | Phase 3 (scenarios) |
| 4 | Priority 2.2-2.3 (documented behaviors, a11y) | Phase 4 (matrices) |
| Later | Priority 3 (mutation testing, contracts) | — |

Estimates are predictions. Real pace depends on what you hit.

---

## Sources (for future reference)

**Part 1:**
- [Pinia testing](https://pinia.vuejs.org/cookbook/testing.html)
- [fast-check](https://github.com/dubzzz/fast-check)
- [StrykerJS](https://github.com/stryker-mutator/stryker-js)
- [@stryker-mutator/vitest-runner](https://www.npmjs.com/package/@stryker-mutator/vitest-runner)
- [@vue/test-utils releases](https://github.com/vuejs/test-utils/releases)
- [@chialab/vitest-axe](https://www.npmjs.com/package/@chialab/vitest-axe)
- [PrimeVue accessibility](https://primevue.org/guides/accessibility/)
- [Vitest benchmark config](https://vitest.dev/config/benchmark)

**Part 2:**
- [Playwright POM](https://playwright.dev/docs/pom)
- [Playwright parameterize](https://playwright.dev/docs/test-parameterize)
- [Playwright fixtures](https://playwright.dev/docs/test-fixtures)
- [Playwright best practices](https://playwright.dev/docs/best-practices)
- [Cucumber vs Playwright](https://www.browserstack.com/guide/cucumber-vs-playwright)
- [BDD without Cucumber](https://javascript.plainenglish.io/playwright-bdd-testing-you-dont-need-cucumber-ae38085c51b7)
- [Data-driven Playwright](https://thenewstack.io/a-practical-guide-to-data-driven-tests-with-playwright/)
