# Sidecar Files

Incremental publish and reverse-dependency queries rely on zero-byte files
whose **names** encode metadata. No content reads — a single directory listing
returns the full dependency state of a page or fragment. Scales to 10k+ items.

## Kinds

Three sidecar kinds live next to each page or fragment's manifest:

| Name | Meaning | Example |
|---|---|---|
| `.{8hex}.hash` | Content hash of the manifest | `.cf120e4b.hash` |
| `.uses-{fragment}` | This item references `@{fragment}` | `.uses-header` |
| `.tpl-{template}` | This item is rendered with `{template}` | `.tpl-page-default` |

`writeSidecars` always writes all three kinds together. Partial state doesn't
occur in real operation — any reader can assume `.hash` presence implies the
`.uses-*` / `.tpl-*` set is complete.

Fragment/template names containing `/` (e.g. `buttons/primary`) are encoded
with `__` in sidecar filenames: `.uses-buttons__primary`.

## Where sidecars live

| Location | Written by | Used by |
|---|---|---|
| **Source** — `sites/{name}/pages/{page}/` | Admin API on save (`PUT /api/pages/...`), file watcher on external edits | `compareTargets` to skip rehashing unchanged items |
| **Target** — `pages/{page}/` in target storage | `publishPageRendered` / `publishPageStatic` / `publishFragmentRendered` | `compareTargets` (is target up to date?), `findDependentsFromSidecars` (what pages use `@header`?) |

Source and target use the **same filename format** — `writeSidecars` /
`listSidecars` / `readSidecars` in [sidecars.ts](../packages/gazetta/src/sidecars.ts)
work for either side.

## Hash input

`hashManifest` serializes the manifest with stable key ordering, substituting
references with hashed forms so the hash catches upstream changes:

- `template: "hero"` → `template: "hero#ab12cd34"` using the template's source hash
- For **static-mode page hashes only**: `"@header"` → `"@header#ef567890"` using
  the fragment's content hash. Fragments are baked into pages in static mode,
  so a fragment change must invalidate every page that uses it.

ESI-mode pages don't include fragment hashes — fragments are published
separately, and the edge runtime composes per request.

## Incremental publish flow

1. `gazetta publish` runs `compareTargets` first.
2. Compare builds local hashes (preferring source sidecars over rehashing) and
   target hashes (by listing target sidecars).
3. Items with matching hashes go in `unchanged`.
4. Unless `--force`, the render loop skips items in `unchanged` and logs
   `N unchanged (skipped)`.

Trust-the-sidecar model: we don't verify the rendered output file exists.
If someone manually deletes `pages/home/index.html` on the target, the sidecar
is lying and `--force` is the escape hatch.

## Reverse-dependency queries

`findDependentsFromSidecars(targetStorage, { fragment: "header" })` lists all
pages and fragments whose sidecars include `.uses-header`, then walks
transitive fragment → fragment references. Used by the admin UI to warn
"publishing @header affects: home, about, blog."

For static targets the admin extends the publish set with these dependents —
republishing `@header` means republishing every page that bakes it in.

## Staleness windows

Source sidecars can go stale when:

- **Template changes.** The CLI template watcher calls `invalidateSourceSidecars()`
  so the next save/edit rescans. Items whose sidecars predate the template change
  get rehashed on next compare.
- **External manifest edits.** The file watcher rewrites sidecars when `page.json`
  or `fragment.json` changes outside the admin (git pull, direct edit).
- **Publishing without running `gazetta dev`.** If sidecars never existed
  because the admin wasn't used, compare falls back to `hashManifest` — correct
  but slower.

Target sidecars become stale only if someone mutates target storage outside
of Gazetta (manual upload, bucket sync). `--force` handles that case.
