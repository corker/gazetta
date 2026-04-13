# Merged JSON Format — Design Document

All component content moves into the page/fragment manifest as JSON. One file per page, one file per fragment.

Every CMS that stores nested component trees uses JSON (Storyblok, Sanity, Builder.io, Payload, Strapi, WordPress Gutenberg). No exceptions. YAML is for flat metadata, JSON is for component trees.

## Current format

```
pages/home/
  page.json              # template, route, content, components list (names only)
  hero/component.json    # template, content
  features/component.json
  features/fast/component.json
  features/composable/component.json
```

Each component is a directory with its own `component.json`. The page's `components` list references directory names.

## New format

```
pages/home/page.json     # everything in one file
```

```json
{
  "template": "page-default",
  "content": {
    "title": "Home",
    "description": "Welcome to Gazetta"
  },
  "components": [
    "@header",
    {
      "name": "hero",
      "template": "hero",
      "content": {
        "title": "Welcome to Gazetta",
        "subtitle": "A stateless CMS"
      }
    },
    {
      "name": "features",
      "template": "features-grid",
      "content": {
        "heading": "Why Gazetta?"
      },
      "components": [
        {
          "name": "fast",
          "template": "feature-card",
          "content": {
            "icon": "⚡",
            "title": "Fast",
            "description": "Edge composition at request time."
          }
        },
        {
          "name": "composable",
          "template": "feature-card",
          "content": {
            "icon": "🧩",
            "title": "Composable",
            "description": "Reusable components everywhere."
          }
        }
      ]
    },
    {
      "name": "demo",
      "template": "counter",
      "content": {
        "label": "Count"
      }
    },
    {
      "name": "banner",
      "template": "banner",
      "content": {
        "text": "Try Gazetta"
      }
    },
    "@footer"
  ]
}
```

### Fragment format

Same structure — one file:

```json
{
  "template": "header-layout",
  "components": [
    {
      "name": "logo",
      "template": "logo",
      "content": {
        "brand": "Gazetta"
      }
    },
    {
      "name": "nav",
      "template": "nav",
      "content": {
        "links": [
          { "label": "Home", "href": "/" }
        ]
      }
    }
  ]
}
```

### Component entry types

The `components` array has mixed types:

| Type | Format | Example |
|------|--------|---------|
| Fragment reference | String starting with `@` | `"@header"` |
| Inline component | Object with `template` | `{ "name": "hero", "template": "hero", "content": {...} }` |
| Inline composite | Object with `template` + `components` | `{ "name": "features", "template": "features-grid", "components": [...] }` |

### Names

- `name` is required on every inline component
- Names must be unique within their parent's `components` list
- Names are kebab-case (same convention as current directory names)
- Names are used for: tree labels, component addressing, test IDs, data-gz hash paths

### Component addressing

Components are identified by **name path** — the chain of names from the page root:

| Component | Name path | Old filesystem path |
|-----------|-----------|-------------------|
| hero | `hero` | `pages/home/hero` |
| features | `features` | `pages/home/features` |
| fast (child of features) | `features/fast` | `pages/home/features/fast` |

Name paths are:
- Stable across reordering (unlike index-based)
- Human-readable
- Compatible with the existing `treePath` / `data-gz` hash system

## What changes

### Types (`types.ts`)

```ts
// Current
interface ComponentManifest {
  template: string
  content?: Record<string, unknown>
  components?: string[]  // directory names
}

// New
interface ComponentManifest {
  template: string
  content?: Record<string, unknown>
  components?: (string | InlineComponent)[]  // mixed: "@fragment" strings or inline objects
}

interface InlineComponent {
  name: string
  template: string
  content?: Record<string, unknown>
  components?: (string | InlineComponent)[]
}
```

### Site loader (`site-loader.ts`)

- Currently: walks `pages/{name}/` directory, reads `page.json`, discovers child directories
- New: reads `pages/{name}/page.json`, all component data is inline
- No directory walking for components — just `JSON.parse`
- Fragment loading: same change — reads `fragment.json`, components inline

### Resolver (`resolver.ts`)

- Currently: for each component name, reads `component.json` from filesystem
- New: component manifest is already in the page's parsed JSON
- `resolveComponent` receives the inline manifest directly, no filesystem read
- Fragment resolution unchanged (still looks up `fragments/` by name)

### Manifest parser (`manifest.ts`)

- Currently: `parseComponentManifest` reads a single file
- New: `parsePageManifest` returns the full nested structure
- Component manifests are nested objects, not separate files

### Admin API — simplified

Remove separate component endpoints. Pages and fragments contain all component data.

Current API (6 component endpoints):
- `GET/PUT/POST/DELETE /api/components` — per-component CRUD via filesystem path

New API (page endpoints do everything):
- `GET /api/pages/:name` — full page with all nested components
- `PUT /api/pages/:name` — write full page JSON (atomic)
- `GET /api/fragments/:name` — full fragment with all nested components
- `PUT /api/fragments/:name` — write full fragment JSON (atomic)

No separate component API. Adding/removing/reordering components = update the page JSON.

### Publish (`publish-rendered.ts`, `publish.ts`)

- `publishItems` copies one file per page/fragment (simpler)
- `publishPageRendered`/`publishPageStatic` reads one file, resolves recursively
- Fewer filesystem reads = faster publish

### Editor store (`stores/editing.ts`) — major simplification

Current: `openComponent(path, template)` → API call per component, separate save closure per component. `save()` calls N save closures.

New:
- `openComponent(namePath)` → reads from `selection.detail.components` (no API call)
- Stash keys use name paths (`"hero"`, `"features/fast"`)
- `save()` → builds updated page JSON with all edits applied, one `PUT /api/pages/:name`
- No per-component save functions — one atomic page write

`EditingTarget` simplifies — remove the `save` closure:

```ts
interface EditingTarget {
  template: string
  namePath: string      // "hero", "features/fast"
  content: Record<string, unknown>
  schema: Record<string, unknown>
  hasEditor?: boolean
  editorUrl?: string
  fieldsBaseUrl?: string
  // No save function — editing store handles page-level save
}
```

### ComponentTree (`ComponentTree.vue`) — major simplification

Current: imports `api`, makes N API calls per tree build.

New: zero API imports. Builds tree from `selection.detail.components` (in-memory). Opens editor by reading component data from the detail.

### Preview overrides

- Currently: `overrides` map keyed by filesystem path
- New: keyed by name path (e.g., `{ "hero": { "title": "..." } }`)
- Preview API `applyOverrides` matches on `treePath` instead of `path`

### CLI init scaffold

- Creates `page.json` with inline components (no component directories)
- Simpler output — fewer files and directories

## Architecture improvements

| Area | Current | After |
|------|---------|-------|
| ComponentTree API calls | N calls per tree build | Zero — reads from selection detail |
| Editing store API calls | 1 per component open + N per save | 0 per open + 1 per save (atomic) |
| Component API endpoints | 4 separate endpoints | Removed — page API covers everything |
| EditingTarget.save | Per-component closure | Not needed — store handles page-level save |
| Tree build latency | Depends on N network requests | Instant (in-memory) |
| Save atomicity | N sequential writes | 1 atomic write |
| Component addressing | Filesystem paths | Name paths (stable across reorder) |

## Migration

### Strategy

Only gazetta.studio needs migrating. Write a one-time migration script:

1. For each page: read `page.json` + all `component.json` files recursively
2. Build the nested structure
3. Write new `page.json`
4. Delete component directories

Same for fragments.

### Backwards compatibility

None needed — only one published site exists. Clean break.

## Benefits

- **One file per page** — trivial hashing for compare (#107)
- **No per-component API calls** — ComponentTree builds instantly
- **No per-component filesystem reads** — resolver is faster
- **Simpler publish** — fewer files to copy and render
- **Atomic save** — page state in one write
- **Cleaner git diffs** — one file changes per page edit

## Risks

- **Large JSON files** — a page with 20+ components could be 200+ lines. Manageable.
- **Git merge conflicts** — two authors editing different components on the same page conflict on one file. Acceptable for single-author workflow.
- **Breaking change** — all existing content needs migration. Only gazetta.studio affected.

## Implementation order

1. Types + manifest parser (new nested types)
2. Site loader (parse new format)
3. Resolver (read from inline manifests)
4. Admin API (component CRUD via name path)
5. CLI init (scaffold new format)
6. Migrate examples/starter
7. Editor store + ComponentTree (name path addressing)
8. Preview overrides (name path keys)
9. Publish (simpler file handling)
10. Migrate gazetta.studio
11. Update tests throughout
