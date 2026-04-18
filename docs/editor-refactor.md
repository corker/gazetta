# Editor Store Refactor

Decompose the editor store, add URL-driven navigation, and make all
editor state shareable via the URL. Zero new dependencies.

## Problem

editing.ts was a 454-line god store with 7 responsibilities, 6 store
dependencies, and no tests. Component selection was lost on refresh.
Target selection was in localStorage, not shareable. Navigation logic
was scattered across multiple files, causing race conditions.

## Architecture

```
URL (source of truth)
  /pages/home/edit?target=staging#hero
  │         │         │            │
  │         │         │            └── watch(route.hash) → applyHashSelection()
  │         │         └── router guard → setActiveTarget()
  │         └── router guard → selectPage()
  └── router guard → enterEdit()

editing.ts (56-line facade)
  ├── editorContent.ts    — pure state, generation guard
  ├── editorStash.ts      — multi-document buffer
  ├── editorPersistence.ts — save → {success, error}
  └── useEditorActions.ts — navigate(sel) + AbortController
       └── editorSelection.ts — typed union + hash serialization
```

## URL Patterns

| URL | What it encodes |
|-----|----------------|
| `/pages/home/edit` | Home page, edit mode, default target, root selected |
| `/pages/home/edit#hero` | Home page, edit mode, default target, hero selected |
| `/pages/home/edit?target=staging#hero` | Home page, edit mode, staging, hero |
| `/pages/home/edit#@header/logo` | Home page, fragment link to logo |
| `/fragments/header/edit#logo` | Header fragment, logo selected |
| `/pages/home` | Home page, browse mode |

Rules:
- No hash = root selected (opens root/SEO editor)
- `?target=` only shown for non-default targets (default = first editable)
- `?target=` stripped if it matches the default
- Hash only written in edit mode, not browse mode

## Stores

### editorContent — pure state

Target, content, saved, dirty, schema, template, path, loadError,
mountVersion, customEditorMount, fragmentLink. No store dependencies.

Key: `savedJson` ref caches `JSON.stringify(saved)` — dirty check does
one stringify per keystroke instead of two. Generation guard in `open()`
discards stale custom editor imports.

### editorStash — multi-document buffer

`reactive(Map)` of path → { target, editedContent }. Stash, restore,
revert, clearAll. No side effects.

### editorPersistence — save orchestration

Takes `(current, stashedEdits[])` as parameters, calls each target's
save function sequentially, returns `{success, error}`. No toasts, no
preview invalidation.

### useEditorActions — mediator

Single `navigate(sel: EditorSelection)` entry point. All component
opens go through one path: cancel pending → stash → check stash →
fetch → open. AbortController cancels pending fetches on new
navigation.

Bounded retry: 3s → 6s → 12s, max 3 attempts (replaces infinite
setInterval). Generation guard prevents stale callbacks.

### EditorSelection — typed union

```ts
type EditorSelection =
  | { kind: 'root' }
  | { kind: 'component', path, template }
  | { kind: 'fragmentLink', fragmentName, treePath, childPath }
  | { kind: 'fragmentEdit', fragmentName }
```

`selectionToHash` / `hashToSelection` handle serialization. Round-trip
tested. `fragmentLinkDestinationHash` computes the hash for the
"Edit @fragment" click-through.

## Navigation Flow

URL is the source of truth. All navigation goes through one of:

1. **Tree click** → `router.push({ hash })` → `watch(route.hash)` →
   `applyHashSelection()` → `navigate(sel)` → open editor
2. **"Edit @fragment" click** → `router.push({ path, hash })` →
   router guard hydrates selection → tree builds →
   `applyHashSelection()` → `navigate(sel)`
3. **Page refresh** → router guard hydrates selection → tree builds →
   `applyHashSelection()` reads existing hash → `navigate(sel)`
4. **Target switch** → `router.push({ query: { target } })` → router
   guard calls `setActiveTarget()` → selection reloads
5. **Preview click-to-select** → `focus.setPending(gzId)` →
   `consumePending()` → `selectByGzId()` → `router.push({ hash })`

One watcher (`watch(route.hash)`) drives all component selection.
No competing navigations.

## Concurrency

- **AbortController** in `navigate()` — cancels pending schema/fragment
  fetches when a new navigation starts
- **Generation guard** in `editorContent.open()` — discards stale
  custom editor imports
- **Stash key snapshot** in `save()` — new entries stashed during the
  async save survive instead of being silently cleared

## Migration from editing.ts

| Step | What | Tests |
|------|------|-------|
| 1 | Extract editorStash | 8 |
| 2 | Extract editorPersistence | 8 |
| 3 | Extract editorContent + savedJson | 18+1 |
| 4 | Create useEditorActions mediator | — |
| 5 | EditorSelection type + hash | 20 |
| 6 | URL-driven navigation (watch route.hash) | — |
| 7 | ?target= query param | — |
| 8 | Remove hash prefix + _root sentinel | — |

editing.ts: 454 lines → 56-line facade.
54 new unit tests. All e2e tests pass.
