# Editor Store Refactor

Decompose `apps/admin/src/client/stores/editing.ts` (454 lines, 7 responsibilities)
into focused stores + a mediator composable. Zero new dependencies.

## Problem

editing.ts is a god store: content lifecycle, stash management, save orchestration,
retry timers, undo actions, preview invalidation, and toast notifications — all in
one file. Every consumer (8 components + router guard) imports the full surface.

Consequences:
- **Untestable** — save() reaches into 6 stores; testing requires mocking all of them
- **Fragile** — retry timer is setInterval with no backoff, scattered across 3 catch blocks
- **Coupled** — adding a side effect to save means editing save() alongside unrelated state
- **No URL persistence** — component selection lost on refresh

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    useEditorActions (mediator)                │
│  openComponent, openPageRoot, openFragment, save, clear      │
│  retry with backoff, URL hash read/write                     │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │editorContent │  │ editorStash  │  │editorPersistence   │  │
│  │              │  │              │  │                    │  │
│  │target        │  │pendingEdits  │  │saving              │  │
│  │content/saved │  │allOverrides  │  │lastSaveError       │  │
│  │dirty         │  │hasPendingEdit│  │                    │  │
│  │schema        │  │              │  │save(target,content,│  │
│  │mountVersion  │  │stash()       │  │  pendingEdits)     │  │
│  │customEditor  │  │restore()     │  │  → {success,error} │  │
│  │              │  │clearAll()    │  │                    │  │
│  │open()        │  │              │  │                    │  │
│  │markDirty()   │  │              │  │                    │  │
│  │discard()     │  │              │  │                    │  │
│  │clear()       │  │              │  │                    │  │
│  └──────────────┘  └──────────────┘  └────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
        ▲ $onAction subscribers (Open/Closed)
        │
   ┌────┴────────────────────────────┐
   │ preview.invalidate()            │
   │ preview.invalidateDraft()       │
   │ publishStatus.refresh()         │
   │ toast.show() / toast.showError()│
   └─────────────────────────────────┘
```

## Stores

### editorContent — "what is being edited right now?"

Pure state. No side effects. No store dependencies.

| State | Type | Purpose |
|-------|------|---------|
| target | EditingTarget \| null | Current editing target (template, path, content, schema, save fn) |
| content | Record \| null | Working copy (mutated by editor onChange) |
| saved | Record \| null | Baseline for dirty comparison |
| savedJson | ref\<string\> | Cached JSON.stringify(saved) — one stringify per keystroke instead of two |
| dirty | computed | JSON.stringify(content) !== savedJson |
| schema | computed | target.schema |
| template | computed | target.template |
| path | computed | target.path |
| loadError | string \| null | Error from last open attempt |
| mountVersion | number | Incremented on open/discard to trigger React remount |
| customEditorMount | EditorMount \| null | Loaded custom editor instance |
| fragmentLink | string \| null | Fragment name when showing "go to fragment" link |

| Method | What it does | Side effects |
|--------|-------------|-------------|
| open(target, editedContent?) | Set target/content/saved, load custom editor, increment mountVersion | None |
| markDirty(content) | Update content ref | None |
| markSaved() | Set saved = content, update savedJson | None |
| discard() | Revert content to saved, increment mountVersion | None |
| clear() | Reset all state to null/defaults | None |
| showFragmentLink(name) | Clear editor, set fragmentLink | None |

Testable with zero mocks. Create store, call methods, assert state.

### editorStash — "what edits are buffered?"

Pure state. No side effects. No store dependencies.

| State | Type | Purpose |
|-------|------|---------|
| pendingEdits | reactive\<Map\> | path → { target, editedContent } |
| pendingCount | computed | pendingEdits.size + (dirty from content store? — see note) |
| hasPendingEdits | computed | pendingCount > 0 |
| allOverrides | computed | Merged map of all stashed + current dirty content |

Note: `pendingCount` and `allOverrides` need the current dirty state from editorContent.
Two options: (a) stash store reads content store directly, (b) mediator computes these
as derived state. Option (a) is simpler — stash imports content store. This is a
read-only dependency on pure state, not a side-effect coupling.

| Method | What it does |
|--------|-------------|
| stash(path, target, editedContent) | Add entry to pendingEdits |
| restore(path) | Remove and return entry, or null |
| has(path) | Check if path has stashed edits |
| revert(path) | Remove entry without returning |
| clearAll() | Empty the map |

### editorPersistence — "how do edits get persisted?"

Receives inputs, returns results. No store dependencies.

| State | Type |
|-------|------|
| saving | boolean |
| lastSaveError | string \| null |

| Method | Signature |
|--------|-----------|
| save | (current: {target, content} \| null, pendingEdits: Map) → Promise\<{success, error?}\> |

The method iterates current + pending entries, calls each target.save(content) sequentially,
returns success or the first error. It does NOT show toasts, invalidate previews, or refresh
publish status. The mediator handles those responses.

### useEditorActions — mediator composable

Wires the 3 stores together. Owns:
- openComponent / openPageRoot / openFragment — with stash + retry
- save — orchestrated (calls persistence, then handles toast/preview/publish)
- refreshAfterRestore — post-undo refresh
- URL hash read/write
- beforeunload handler

Lives in `composables/useEditorActions.ts`. Used by components that need to trigger
actions (ComponentTree, EditorPanel, CmsToolbar, router guard).

Components that only need state (PreviewPanel reading allOverrides, CmsToolbar reading
saving flag) import the individual stores directly.

## Side Effects via $onAction

Instead of save() calling preview.invalidate() directly:

```ts
// In a Pinia plugin or at app init
const persistence = useEditorPersistenceStore()
persistence.$onAction(({ name, after }) => {
  if (name === 'save') {
    after(() => {
      usePreviewStore().invalidate()
      usePublishStatusStore().refresh()
    })
  }
})
```

Or: the mediator handles these in its save() wrapper. Either works. The key: the
persistence store itself doesn't know about previews or publish status.

For markDirty → preview.invalidateDraft(), the mediator's markDirty wrapper calls
both content.markDirty() and preview.invalidateDraft().

## Retry with Bounded Backoff

Lives in the mediator. Replaces 3 identical setInterval patterns.

```ts
async function withRetry(
  fn: () => Promise<void>,
  errorLabel: string,
  maxAttempts = 3,
  baseDelay = 3000,
) {
  let generation = ++retryGeneration
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await fn()
      return
    } catch (err) {
      content.setLoadError(`Failed to load "${errorLabel}": ${(err as Error).message}`)
      if (attempt < maxAttempts - 1) {
        await new Promise(resolve => {
          retryTimer = setTimeout(resolve, baseDelay * 2 ** attempt)
        })
        if (generation !== retryGeneration) return  // cancelled
      }
    }
  }
}
```

clearRetry increments retryGeneration and clears the timeout. The generation check
prevents stale callbacks.

## URL Hash

Format: `#component=hero`, `#component=_root`, `#component=%40header`

- **Write:** mediator updates hash after every open/clear via router.push({ hash, replace: true })
- **Read:** ComponentTree reads hash on mount, calls the appropriate open method
- **Clear:** on enterBrowse(), on leaving edit route, on clear()
- **Ignored:** in browse mode, on dev routes, on home route

Hash logic lives in components (ComponentTree, router guard), not in stores — because
stores may initialize outside component scope (in router guard) where useRouter() fails.

## Consumer Migration

| Consumer | Before | After |
|----------|--------|-------|
| EditorPanel | editing.schema, editing.content, editing.markDirty, etc. | content.schema, content.content, actions.markDirty, etc. |
| ComponentTree | editing.openComponent, editing.dirty, editing.hasPendingEdit | actions.openComponent, content.dirty, stash.has |
| CmsToolbar | editing.saving, editing.hasPendingEdits, editing.save | persistence.saving, stash.hasPendingEdits, actions.save |
| PreviewPanel | editing.allOverrides | stash.allOverrides |
| router | editing.hasPendingEdits, editing.save, editing.clear | stash.hasPendingEdits, actions.save, actions.clear |
| HistoryPanel | editing.refreshAfterRestore | actions.refreshAfterRestore |
| uiMode | editing.clear | actions.clear |

During migration, editing.ts can remain as a thin facade re-exporting from the new
stores, so consumers migrate incrementally.

## Migration Steps

Each step is independently shippable:

1. **Extract editorStash** — move pendingEdits, allOverrides, hasPendingEdit, revertStashed.
   editing.ts imports it. Write tests. Zero behavior change.

2. **Extract editorPersistence** — move save(), saving, lastSaveError. Make save() take
   parameters instead of reading stores. Wire via mediator. Write tests.

3. **Extract editorContent** — remaining state (target, content, saved, dirty, etc.).
   Add savedJson optimization. Write tests.

4. **Create useEditorActions** — move openComponent/openPageRoot/openFragment here.
   Add withRetry (bounded backoff), URL hash. Write tests.

5. **Move side effects to subscribers** — preview invalidation, publish status refresh,
   toast notifications react to store actions via $onAction or mediator wiring.

6. **Remove editing.ts facade** — once all consumers are migrated.

## Files

| New file | Lines (est.) | Responsibility |
|----------|-------------|----------------|
| stores/editorContent.ts | ~100 | Current edit state |
| stores/editorStash.ts | ~60 | Pending edits buffer |
| stores/editorPersistence.ts | ~50 | Save orchestration |
| composables/useEditorActions.ts | ~150 | Mediator: open, save, retry, hash |
| stores/editing.ts (temp facade) | ~30 | Re-exports during migration |

| Modified file | Changes |
|---------------|---------|
| ComponentTree.vue | Import from new stores/actions, hash write on mount |
| EditorPanel.vue | Import from content store + actions |
| CmsToolbar.vue | Import from persistence + stash stores |
| PreviewPanel.vue | Import from stash store |
| router.ts | Import from stash + actions, hash clear |
| ActiveTargetIndicator.vue | Import from stash + actions |
| HistoryPanel.vue | Import from actions |
| uiMode.ts | Import from actions |

| New test files | What they test |
|---------------|---------------|
| tests/editorContent.test.ts | open, markDirty, discard, dirty check, savedJson |
| tests/editorStash.test.ts | stash, restore, allOverrides, clearAll |
| tests/editorPersistence.test.ts | save with mock targets, error handling |
| tests/editorActions.test.ts | open sequence, retry backoff, stash integration |
