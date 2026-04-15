# Editor UX

How the CMS admin organizes authoring, comparison, and publishing around a single spine:
the **active target**. This doc covers UX concepts and behavior rules; see design-concepts.md
for the underlying nouns and design-publishing.md for operations.

## The active target is the UX spine

At any moment, exactly one target is active. Everything in the workspace orients around it:

| Surface | Binds to active target as |
|---------|---------------------------|
| Tree | Structure of active target |
| Editor | Form for selected item on active target |
| Preview | Rendered output of active target |
| Save | Writes to active target (if editable) |
| Publish | Defaults source or destination to active |
| Sync indicators | Other targets shown "N behind/ahead of active" |
| Compare | Framed as "active vs X" |

## Editable vs read-only

A target's `editable` flag determines what the author can do when that target is active:

| `editable` | Author can | Author cannot |
|-----------|-----------|---------------|
| `yes` | Edit form, save, receive publishes from other targets | — |
| `no` | View tree, inspect editor (read-only), view preview, publish *from* this target to others | Save, receive publishes |

The workspace chrome reflects the current state: read-only active targets lock the editor,
hide the save button, and show read-only indicators.

## Switching active target

Switching is always allowed and cheap — it's focus, not a commitment. No confirmation
dialogs, no loading states. Two affordances for two intents:

### Global target switch (top-bar selector)

**Intent:** "Navigate my workspace to a different target."

- Location: top bar, always visible
- Shows: active target name + environment chrome + sync indicators for other targets
- Behavior:
  - If focused item (page/fragment) exists on destination → preserve focus, swap target
  - If focused item doesn't exist on destination → focus drops to site root; transient banner:
    *"pages/pricing isn't on staging — showing site root"* with one-click "back to pages/pricing on local"
- Feel: deliberate, navigational

### Page-context target switch (preview tabs)

**Intent:** "Compare this page across targets."

- Location: top of the preview pane (preview is always page-scoped, so scope is implicit)
- Shows: one tab per target, active tab highlighted, disabled for targets missing this item
- Behavior:
  - Instant swap
  - Preserves preview scroll, viewport, zoom
  - Preserves editor scroll + per-target dirty form state
  - Updates top-bar active target in sync
  - Disabled tab tooltip: *"pages/pricing isn't on staging. [Publish from local]"*
- Feel: rapid, A/B toggle, no commitment

Both switchers mutate the same active-target state; they differ in affordance placement
and implied intent.

## What's preserved across switches

Switching must not disorient the author. Preserve across active-target switches:

- **Preview**: scroll position, viewport size, zoom, device mode
- **Editor**: scroll position, expanded fields, per-target dirty form state
- **Tree**: expansion state
- **Selection**: focused item + any sub-selection
- **Form state per target**: each editable target has its own in-memory draft;
  switching away and back restores it

Per-target dirty form state means: edit on local → switch to prod to peek → switch back to local
→ unsaved edits are still there. Only explicit "discard" or reload clears form state.

## Making the active target unmistakable

Rapid target switching (comparison mode) requires the author to always know which target is
active without conscious thought. Design commitments:

- **Workspace chrome tinted by environment**: prod gets red accents on top bar, edges, borders.
  Local is neutral. Staging is amber. Applied to the whole workspace, not just a corner —
  peripheral vision catches it.
- **Persistent target name** in a fixed top-bar position, large enough to read without focus
- **Strong active tab** styling on preview tabs
- **Save button label** reflects the target: "Save to prod" when prod is active (when editable)

If the author is editing production directly (allowed by `editable: yes` on prod), the prod
chrome is permanent — no confirmation dialog, but constant visual warning.

## Item availability across targets

An item is "available" on a target if its path exists there. Availability determines:

- **Preview tab state**: disabled if item missing, enabled otherwise
- **Global switch fallback**: if item missing on destination, drop focus to root
- **Empty-state messaging**: when an item doesn't exist on the destination, show a publish
  affordance ("Publish pages/pricing from local to staging") rather than a raw error

The tree reflects only the active target's structure — it does not show items present on
other targets. Cross-target visibility lives in sync indicators and publish flows.

## Save and publish share a pipeline

Save and publish are architecturally the same operation — "write logical content to
destination + render if destination is static." They differ only in destination:

- **Save**: form-state → active target
- **Publish**: target → target (either direction)

From the author's POV, save is instant on dynamic targets; on static edit targets, save
incurs render cost and shows a visible "Saving…" state. Preview reflects saved state
(or dirty form state if unsaved).

## Undo and rollback

Every write records a revision on the target (see design-publishing.md for storage shape).
Two UX entry points surface the same underlying mechanism:

**Transient Undo after an action.** After a save or publish completes, the top bar briefly
shows the action + an Undo button:

> *Published 3 items to prod. [Undo]*

One click restores the target's immediately prior state (as a new revision). The Undo
affordance disappears once a newer write lands on that target — use the history panel for
arbitrary rollback after that point.

**Target history panel.** Click a target in the top bar to open its history — a list of
revisions with timestamp, author, operation, and affected items. Each row has a **Restore**
action that creates a new revision matching that past state. Rollback is just restore to
an older revision.

Undo and rollback are the same operation; they differ only in entry point. Both produce
forward-only revisions — history never shrinks except via retention eviction.

## Scaling to 4+ targets

When the total target count is ≥ 4, targets sharing an `environment` collapse into a group
across all target-referencing surfaces. Groups of 1 stay flat; targets with no environment
set display ungrouped alongside groups.

| Surface | ≤ 3 targets (flat) | 4+ targets (grouped) |
|---------|--------------------|-----------------------|
| Top-bar sync indicators | `staging · 3b   prod · 7b` | `staging · 3b   production (2) · 7b` (click → expand) |
| Preview tabs | `[ local \| staging \| prod ]` | `[ local \| staging \| production ▾ ]` |
| Publish picker (From / To) | Flat dropdown | Dropdown grouped by environment with headers |

**Cycling within a group:** Clicking a group tab directly cycles through its members; the
chevron opens an explicit member picker. When a group member is active, the tab/indicator
shows which: `[ production: prod-us ▾ ]`.

**Grouping is presentation only.** Environments remain non-hierarchical in the model;
grouping is a UX compression for density, not a configured concept.

## Multi-destination publish (fan-out)

The Publish picker's "To" selector supports multi-select. Selecting an environment group
selects all its members; individual members can be toggled. A single Publish action then
fans out to all selected destinations.

Progress is reported per-destination; a failure on one destination does not abort the
others. Author sees the full matrix of results.

No new operation — Publish already moves content between any two targets. Fan-out is a
picker mode on top of the same verb.

## Progressive disclosure

The UI adapts to configured targets. Features appear based on config, not user profile:

| Configuration | UI changes |
|---------------|------------|
| 1 target configured | No publish UI. Save is all. No target switcher. |
| 2+ targets | Publish affordance appears. Sync indicators in top bar. |
| 4+ targets | Environment-based grouping in sync indicators, preview tabs, and publish picker. |
| 2+ peers share an environment | Fan-out publish available (multi-select in picker). |
| 2+ targets, one tagged `production` | Prod chrome (red accents) everywhere prod is referenced. |
| 2+ editable targets | Active-target switcher in top bar becomes interactive. |
| Item focused with 2+ targets | Preview tabs appear for page-context comparison. |
| Editable target tagged `production` | Prod chrome on workspace when active; "Save to prod" labeling. |
| Any target marked non-editable | That target appears read-only when active; save is absent. |

No profile selection, no settings toggles. Target configuration *is* the workflow.

## Out of sync

When two targets differ in logical content, they're "out of sync." No hierarchy is implied
— neither target is presumed correct. The author knows which is authoritative because the
author configured the workflow. UI framing:

- "staging: 3 behind local" = three items on local that staging doesn't have or differs on
- "prod: 2 ahead of local" = two items on prod that local doesn't have or differs on
  (typical of direct-to-prod hotfixes)

All sync state is expressed relative to the active target. The author picks the reference
point by choosing what's active.

## Author's mental model (one sentence)

> I have one or more targets. One is active — that's where I'm focused: its tree, its editor,
> its preview. If it's editable, I can save to it. I can switch focus to any other target at
> any time, instantly, without losing my place. Publish moves content from one target to
> another, in any direction.

## Current code alignment

The design above is forward-looking. Current code state:

- **Active target** — partially exists as `usePublishStatusStore`'s "primary target" in
  [apps/admin/src/client/stores/publishStatus.ts](../../apps/admin/src/client/stores/publishStatus.ts)
  (picks production → staging → local for the tree's dirty-dot indicator). The designed
  "active target as UX spine" extends this store rather than introducing it from scratch.
- **Target properties** — `environment` is implemented on `TargetConfig`
  ([packages/gazetta/src/types.ts](../../packages/gazetta/src/types.ts)). `type` and
  `editable` are not yet in code.
- **Unified Publish** — not yet; code has three separate dialogs (PublishDialog, FetchDialog,
  ChangesDrawer). Compare endpoint (`/api/compare`) already does logical diff by hash.
- **Preview tabs for per-page target switching** — not yet; PreviewPanel has no target
  switcher today.
- **Fragment preview** — already implemented via `/@{name}` routing in
  [apps/admin/src/client/utils/selection.ts](../../apps/admin/src/client/utils/selection.ts).
  Host-page selection provides preview context; standalone fragment preview works.
- **Fragment blast radius** — shown in PublishDialog only; designed extension is to also
  surface it inline in the tree and editor header (gap).
- **Undo / rollback / revision history** — not implemented. Designed: per-target history in
  `.gazetta/history/` inside the target, content-addressed blobs, soft undo (forward-only
  revisions). See design-publishing.md "History" section.

## Open spots (not yet designed)

- **Fragment blast radius in tree and editor header** — currently only in PublishDialog
- **Multi-author** — concurrent editing, locks, handoffs
- **Batches / named releases** — grouping changes into a publishable unit
- **Scheduled publishes** — delayed or time-triggered publish
- **Permissions / roles / authentication** — per-user capabilities
- **Split-preview comparison** — side-by-side view of two targets for the same page
- **Target configuration surface** — where targets are declared (YAML file vs in-CMS settings)
- **Splitting `editable`** — potentially into `writable` (form-edit) and `publishable` (receive publishes)
  if teams need "publish to prod, but don't edit it directly"
- **Overwrite warning** — when publishing would replace newer content on the destination
