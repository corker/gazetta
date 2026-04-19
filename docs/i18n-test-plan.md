# i18n Test Plan

Comprehensive verification plan for the i18n feature (PR #190). Covers both
deployment strategies, all runtime modes, edge cases, and known bugs.

**Status legend:** [ ] not tested · [x] verified · [~] partial · [!] bug

**Summary:** 302 use cases — 108 verified, 20 bugs, 174 gaps.

---

## 1. Config parsing (14 cases)

- [x] No `locales` in site.yaml — i18n disabled, single-locale
- [x] `locales.supported: [en, fr]` — two locales enabled
- [x] `locales.supported: [en, fr, de, pt-BR]` — four locales with region code
- [x] `locales.supported: []` — empty list, treated as no i18n
- [x] `locale: fr` explicit default override
- [x] `locale` omitted — first in `supported` is default
- [x] `locales.fallbacks: { pt-br: pt }` — explicit chain
- [x] `locales.fallbacks` omitted — no chain, direct to default
- [x] Circular fallback: `{ pt-br: pt, pt: pt-br }` — must terminate
- [x] `locales.detection: true` — Accept-Language enabled
- [x] `locales.detection: false` — no redirect
- [x] `locales.defaultPrefix: true` — default locale gets URL prefix (/en/about)
- [x] `locales.defaultPrefix: false` — default has no prefix (/about)
- [x] BCP 47 normalization: `EN-GB` → `en-gb` in config

## 2. Target-level locale config (7 cases)

- [x] Target inherits all site locales when no override
- [x] Target narrows: `locales: [fr, de]` — subset of site
- [x] Target overrides default: `locale: de`
- [x] Single-locale target: `locales: [fr]` — infers locale=fr, detection=false, defaultPrefix=false
- [x] Target overrides detection: site true, target false
- [x] Target overrides defaultPrefix: site false, target true
- [x] Target with no locales field + site has locales — inherits all

## 3. File discovery — site-loader (10 cases)

- [x] `page.json` only — default locale, no variants
- [x] `page.json` + `page.fr.json` — default + one variant
- [ ] `page.json` + `page.fr.json` + `page.de.json` — multiple variants
- [ ] `page.fr.json` without `page.json` — French-only page (valid per design)
- [ ] `page.en.json` when `en` is default — ambiguous, should warn
- [x] `fragment.json` + `fragment.fr.json` — fragment locale variant
- [ ] Nested page: `blog/[slug]/page.fr.json` — dynamic route with locale
- [ ] Malformed filename: `page.en-gb-x.json` — not recognized as locale
- [ ] Invalid JSON in `page.fr.json` — skipped with warning, continues
- [ ] Case sensitivity: `page.FR.json` on case-insensitive filesystem

## 4. Route generation (6 cases)

- [x] Default locale: `page.json` → `/about`
- [x] Non-default locale: `page.fr.json` → `/fr/about`
- [x] Home page locale: `page.fr.json` → `/fr` (not `/fr/`)
- [ ] Dynamic route locale: `blog/[slug]/page.fr.json` → `/fr/blog/:slug`
- [x] `defaultPrefix: true`: default locale → `/en/about`
- [ ] `defaultPrefix: true` + home: → `/en`

## 5. Resolver (8 cases)

- [x] `resolvePage('home', site)` — default locale content
- [x] `resolvePage('home', site, 'fr')` — uses page.fr.json content/components
- [x] `resolvePage('home', site, 'de')` when no page.de.json — falls back to default
- [x] Fragment ref `@header` in French page — resolves fragment.fr.json if exists
- [x] Fragment ref `@header` in French page — falls back to fragment.json if no French
- [ ] Fallback chain: `pt-br` → `pt` → default via resolveLocaleFallback
- [ ] French page with different component list than English — independent manifests
- [ ] French page references fragment not in English page — works (independent)

## 6. Preview — admin API (11 cases)

- [x] `GET /admin/preview/` — English home
- [x] `GET /admin/preview/fr` — French home
- [x] `GET /admin/preview/about` — English about
- [x] `GET /admin/preview/fr/about` — French about
- [x] `GET /admin/preview/@header` — English header fragment
- [x] `GET /admin/preview/fr/@header` — French header fragment (or fallback)
- [x] `GET /admin/preview/blog/hello-world` — English dynamic route
- [ ] `GET /admin/preview/fr/blog/hello-world` — French dynamic route (or fallback)
- [x] `GET /admin/preview/nonexistent` — 404
- [x] `GET /admin/preview/fr/nonexistent` — 404
- [ ] POST preview with overrides + locale — draft content in French

## 7. Admin API — pages (9 cases)

- [x] `GET /api/pages` — list includes `locales: ['fr']` on translated pages
- [x] `GET /api/pages` — pages without translations: empty/no locales array
- [x] `GET /api/pages/home` — returns default content, no locale field
- [x] `GET /api/pages/home?locale=fr` — returns French content, `locale: 'fr'`
- [x] `GET /api/pages/home?locale=de` — no German, falls back to default
- [!] `PUT /api/pages/home?locale=fr` — **BUG: writes to page.json not page.fr.json**
- [x] `PUT /api/pages/home` (no locale) — writes to page.json (correct)
- [!] `DELETE /api/pages/home` — **BUG: doesn't delete locale files (orphaned page.fr.json)**
- [x] `POST /api/pages` (create) — creates page.json only, no locale files

## 8. Admin API — fragments (4 cases)

- [x] `GET /api/fragments` — list includes locales array
- [x] `GET /api/fragments/header?locale=fr` — returns French fragment
- [!] `PUT /api/fragments/header?locale=fr` — **BUG: writes fragment.json not fragment.fr.json**
- [!] `DELETE /api/fragments/header` — **BUG: doesn't delete locale files**

## 9. Admin API — site (2 cases)

- [x] `GET /api/site` — returns `locales: { supported: ['en', 'fr'] }`
- [x] `GET /api/site` without locales config — no locales field

## 10. Admin UI — locale picker (6 cases)

- [x] EN and FR buttons visible when locales configured
- [x] EN active (green) by default
- [x] Click FR — FR becomes active, URL gets `?locale=fr`
- [x] Click EN — `?locale=` removed
- [ ] Picker hidden when site has no locales config
- [ ] Picker hidden when site has only one locale

## 11. Admin UI — SiteTree badges (6 cases)

- [x] Pages with translations show locale badges (home [FR])
- [x] Pages without translations show no badges
- [x] Fragments show blast radius icons
- [ ] Fragments with translations show locale badges
- [x] Badges visible in dark mode
- [x] Badges visible in light mode

## 12. Admin UI — preview switching (6 cases)

- [x] EN home: "Welcome to Gazetta"
- [x] FR home: "Bienvenue sur Gazetta", "Pourquoi Gazetta ?", "Clics"
- [x] EN→FR→EN round-trip works
- [x] About page locale switching
- [ ] Page without FR variant — click FR → English fallback in preview
- [ ] `<html lang>` matches selected locale in iframe

## 13. Admin UI — editor with locale (6 cases)

- [ ] Editor shows English content when EN selected
- [ ] Editor shows French content fields when FR selected
- [ ] Edit French field → preview updates with draft content
- [!] Save while FR active → **BUG: writes page.json not page.fr.json**
- [ ] Click EN → editor returns to English content
- [ ] Unsaved changes guard fires when switching locale with dirty form

## 14. Admin UI — URL persistence (12 cases)

- [x] `?locale=fr` persists on page refresh
- [!] **BUG: `?locale=fr` dropped when clicking page in SiteTree** — `onSelect` uses string push
- [!] **BUG: `?locale=fr` dropped when clicking back-to-browse in CmsToolbar** — string push
- [!] **BUG: `?locale=fr` dropped when clicking back-to-browse in EditorView** — string push
- [!] **BUG: `?locale=fr` dropped when clicking fragment link in EditorPanel** — object push but no query
- [!] **BUG: `?locale=fr` dropped when clicking component in PreviewPanel** — string push (edit mode)
- [!] **BUG: `?locale=fr` dropped when clicking page link in PreviewPanel** — string push (fragment host)
- [!] **BUG: `?locale=fr` dropped when switching target in ActiveTargetIndicator** — query has target but not locale
- [x] `?locale=fr` combined with `?target=staging` (when both set manually in URL)
- [x] `#hash` preserved when switching locale
- [x] `?locale=fr` + `#hero` in URL at same time
- [ ] Browser back/forward preserves `?locale=fr`

## 15. Publish — ESI mode (7 cases)

- [x] Default locale → `pages/home/index.html`
- [x] French locale → `pages/home/index.fr.html`
- [x] Default and French don't overwrite each other
- [x] `<html lang="en">` on default, `<html lang="fr">` on French
- [x] ESI fragment refs: `<!--esi:/fragments/header/index.fr.html-->` for French page
- [x] Sidecars written only for default locale, not locale variants
- [x] Locale-only publish (no default first) — creates HTML, no sidecars

## 16. Publish — static mode (5 cases)

- [x] Default → `about/index.html`
- [x] French → `fr/about/index.html`
- [x] Home French → `fr/index.html`
- [x] Default and French coexist
- [ ] `defaultPrefix: true` → `en/about/index.html`

## 17. Publish — fragments (4 cases)

- [x] Default → `fragments/header/index.html`
- [x] French → `fragments/header/index.fr.html`
- [x] Default and French coexist
- [x] Sidecars written only for default, not locale variants

## 18. Publish — all locales loop (4 cases)

- [x] Page with 2 locales → 2 renders
- [ ] Page with no locale variants → 1 render (default only)
- [ ] Target with `locales: [fr]` — should skip default, publish only French
- [ ] File count aggregated correctly across locales

## 19. Serve — locale routing (10 cases)

- [x] `GET /about` → English page
- [x] `GET /fr/about` → French page (locale-suffixed file)
- [x] `GET /fr/about` when index.fr.html missing → fallback to index.html
- [x] Unknown locale prefix → treated as regular path (404)
- [x] `GET /fr` → French home page
- [x] `GET /fr/blog/hello-world` → French dynamic route
- [x] Fragment locale fallback: index.fr.html → index.html
- [x] Both fragment locales missing → comment placeholder
- [x] `GET /` → default home
- [ ] 404 page with locale prefix

## 20. Serve — Accept-Language detection (12 cases)

- [x] `Accept-Language: fr-FR` → 302 to `/fr/about`
- [x] `Accept-Language: en-US` → no redirect (default locale)
- [x] No Accept-Language header → no redirect
- [x] `Accept-Language: ja` → no redirect (no match)
- [x] Already locale-prefixed → no redirect
- [x] Cookie `locale=fr` → 302 to `/fr/about` (overrides Accept-Language)
- [ ] Cookie `locale=invalid` → ignored
- [x] Quality ordering: `en;q=0.5,de;q=0.9` → redirect to /de
- [x] Region matching: `de-AT` + locales `[de]` → matches base
- [x] `detection: false` → no redirect
- [ ] Target-level detection override
- [ ] `q=0` → excluded from matching

## 21. Cloudflare Worker (9 cases)

- [x] Worker extracts locale prefix from URL
- [ ] Worker reads `index.fr.html` for French page
- [ ] Worker falls back to `index.html` when locale file missing
- [ ] Worker fragment locale fallback
- [ ] Worker missing fragment → comment placeholder
- [x] `locales` option configures routing
- [x] Without `locales` option → no locale handling (backward compat)
- [ ] Cache key includes locale (different cache per locale)
- [ ] Cache purge purges all locale URLs

## 22. Dev server — public site (7 cases)

- [x] `GET /` → English home
- [x] `GET /fr` → French home
- [x] `GET /about` → English about
- [x] `GET /fr/about` → French about
- [ ] `GET /blog/hello-world` → English blog
- [ ] `GET /fr/blog/hello-world` → French blog (or fallback)
- [ ] Page without FR variant → `/fr/showcase` → 404

## 23. CLI — translate (7 cases)

- [x] `gazetta translate pages/about --to fr` → creates page.fr.json
- [ ] `gazetta translate fragments/header --to de` → creates fragment.de.json
- [ ] `gazetta translate pages/about --to fr local` → uses specific target
- [x] Refuses to overwrite existing locale file
- [x] Errors on missing source page
- [ ] Normalizes locale code (`--to FR` → page.fr.json)
- [ ] Region code: `--to en-GB` → page.en-gb.json

## 24. CLI — publish (3 cases)

- [ ] `gazetta publish production` → publishes all pages × all locales
- [ ] Target with `locales: [fr]` → only French published
- [ ] `--locale fr` flag to publish single locale (not implemented)

## 25. SEO — hreflang in HTML (6 cases)

- [!] **GAP: hreflang alternates never populated in SeoContext** — infrastructure exists but caller never passes them
- [x] hreflang with 2+ alternates → link tags generated (unit test)
- [x] x-default points to default locale (unit test)
- [x] Omitted when only 1 locale variant (unit test)
- [ ] Excludes noindex pages from hreflang group
- [x] Self-referencing alternate

## 26. SEO — hreflang in sitemap (6 cases)

- [!] **GAP: Sitemap hreflangGroups never computed by publish** — infrastructure exists but empty
- [x] Sitemap hreflang cross-links when 2+ alternates (unit test)
- [x] Omits hreflang when only one alternate (unit test)
- [x] Omits when no groups provided (unit test)
- [ ] Cross-domain hreflang (target A links to target B)
- [ ] Bidirectional validation (A links B, B links A)

## 27. Compare (3 cases)

- [ ] **GAP: Compare ignores locale variants — single hash per page**
- [ ] Compare should show "about (fr) ahead of staging"
- [ ] Locale changes invisible to incremental publish

## 28. Publish progress + history (3 cases)

- [ ] **GAP: Progress stream has no locale field**
- [ ] **GAP: History revision doesn't record locale of the save**
- [ ] Undo a French save → should restore page.fr.json not page.json

---

## 29. Custom editors & fields with locale (5 cases)

- [ ] EditorMount.mount() has no locale param — custom editors can't adapt to locale
- [ ] FieldMount.mount() has no locale — locale-aware fields impossible
- [ ] Locale switch doesn't trigger editor remount — stale undo/redo stack
- [ ] Editor form state not isolated per locale — partial EN edits lost on FR switch + back
- [ ] Dev playground doesn't pass `?locale=` to preview

## 30. Multi-target locale interactions (4 cases)

- [ ] Locale persists across target switch — `?locale=fr` survives active target change
- [ ] Compare with different locale subsets — target A has [en,fr,de], target B has [en,fr]
- [ ] Publish to target with locale subset — skip pages outside target's locales
- [ ] Fetch (reverse publish) with locale files — recovers page.fr.json

## 31. Concurrent operations (3 cases)

- [ ] Two authors save different locales simultaneously — no overwrite race
- [ ] Locale switch with unsaved edits — unsaved dialog fires
- [ ] Save EN while FR preview loads — no stale render

## 32. File watcher & SSE with locale (3 cases)

- [ ] Template change during locale preview — SSE reloads FR preview
- [ ] Locale file created externally — site tree updates with badge
- [ ] Fragment locale file added — SiteTree shows badge

## 33. Error handling with locale (4 cases)

- [ ] Template missing for locale page — skip with error, don't crash
- [ ] Template SSR crash on locale content — skip that locale's render
- [ ] Storage read fails on locale file mid-publish — error handling
- [ ] Schema validation error in locale file — validate/publish catches it

## 34. Component operations with locale independence (4 cases)

- [ ] Move component in FR doesn't affect EN page.json
- [ ] Add component to FR only — EN unchanged
- [ ] Remove component from FR — EN still has it
- [ ] Template switch on locale page — content mapping/loss

## 35. Metadata per locale (5 cases)

- [ ] Locale-specific metadata.title → different `<title>` per locale
- [ ] Locale-specific metadata.description → different meta description
- [ ] Locale-specific og:image → each locale uses own image
- [ ] Noindex on one locale only — sitemap excludes FR, keeps EN
- [ ] Canonical URL per locale — each renders correct canonical

## 36. URL edge cases (9 cases)

- [!] **BUG: /fr/ (trailing slash) → 404** but /fr → 200. Trailing slash not normalized.
- [!] **BUG: /fr/about/ (trailing slash) → 404** but /fr/about → 200.
- [ ] Double locale prefix: /fr/fr/about → 404 (confirmed)
- [ ] Locale code collides with page name — /fr resolves as locale prefix, not page
- [ ] Mixed-case locale in URL: /FR → 404, not normalized to /fr (confirmed)
- [ ] Query param locale /about?locale=fr on public site — ignored (correct, path-based)
- [!] **BUG: /fr/blog/hello-world → 404** — dynamic route fallback missing for locale prefix on dev server
- [ ] /admin/preview/fr/ (trailing slash) → 404 (confirmed)
- [ ] /admin/preview/FR (uppercase) → 404 (confirmed)

## 37. Migration & config changes (3 cases)

- [ ] Add i18n to existing site — page.json becomes default locale
- [ ] Remove i18n config — orphaned locale files warned by validate
- [ ] Change default locale en→fr — routes remap, content resolves correctly

## 38. History with locale (3 cases)

- [ ] Save EN then save FR then undo — restores page.fr.json only
- [ ] History panel shows locale of each revision
- [ ] Rollback locale-specific revision — only that locale file restored

## 39. Sitemap locale URLs (3 cases)

- [ ] Sitemap has both /about and /fr/about as separate `<url>` entries
- [ ] Each locale URL has its own `<lastmod>` from publish timestamp
- [ ] Dynamic routes excluded even with locale variants

## 40. Client save/update doesn't pass locale (3 cases)

- [!] `api.updatePage()` has no locale param — **BUG: client never sends ?locale= on PUT**
- [!] `api.updateFragment()` has no locale param — **BUG: same**
- [!] `buildSaveFn` closure captures no locale — save always hits default file even when fixed server-side

## 41. ESI assembly with locale fragments (2 cases)

- [ ] `<!--esi:/fragments/header/index.fr.html-->` replaced correctly by assembleEsi
- [ ] `findEsiPaths` extracts locale-suffixed fragment paths

## 42. Template loader cache isolation (2 cases)

- [ ] Same template renders EN then FR — no state leak between renders
- [ ] Template with module-level mutable state — no cross-locale interference

## 43. Admin API locale query param validation (4 cases)

- [!] **BUG: `?locale=FR` (uppercase) not normalized** — returns `locale: "FR"`, should normalize to `"fr"`
- [!] **BUG: `?locale=xx` (invalid) silently accepted** — returns `locale: "xx"` with default content
- [!] **BUG: `?locale=` (empty) returns `locale: ""`** — empty string not stripped
- [ ] `?locale=en` (default locale explicitly) — returns content with `locale: "en"` (OK but wasteful)

## 44. Hash divergence per locale (1 case)

- [ ] Same page with different locale content produces different manifest hashes

## 45. Cache purge with locales (2 cases)

- [!] **BUG: Cache purge only purges default locale URLs** — `/about` purged but `/fr/about` not
- [ ] Fragment publish purges all (correct) — but page publish misses locale URLs

## 46. Validate with locales (3 cases)

- [ ] Validate doesn't check locale files for broken template/fragment refs
- [ ] Validate doesn't warn about page.en.json when en is default (ambiguous)
- [ ] Validate doesn't warn about orphaned locale files when i18n disabled

## 47. Incremental publish with locale changes (2 cases)

- [!] **BUG: Locale file change not detected by incremental publish** — hash is per-page, not per-locale
- [ ] page.fr.json modified, page.json unchanged → should still re-render FR variant

## 48. Publish partial failure with locales (2 cases)

- [ ] Default locale publish fails → locale variants still attempted or skipped?
- [ ] One locale variant fails mid-publish → others still published (partial state)?

## 49. Static mode serve with locale paths (2 cases)

- [ ] Static mode: /fr/about → serves fr/about/index.html
- [ ] Static mode: locale detection not available (no runtime)

## 50. Page name conflicts with locale code (2 cases)

- [ ] Page named "fr" + locale "fr" → /fr resolves as locale prefix, not page
- [ ] Page named "en" with defaultPrefix: true → /en is ambiguous

## 51. Robots.txt with locales (1 case)

- [ ] robots.txt Sitemap directive doesn't reference per-locale sitemaps

## 52. Fetch (reverse publish) with locales (2 cases)

- [ ] Fetch pages/home from target copies both page.json and page.fr.json
- [ ] Fetch from single-locale target (locales: [fr]) copies only French files

## 53. Create page in non-default locale (2 cases)

- [ ] POST /api/pages with ?locale=fr — unsupported, should error or create page.fr.json
- [ ] Create page.fr.json without page.json existing — French-only page

## 54. Dependents API with locales (2 cases)

- [ ] GET /api/dependents doesn't count locale variant pages using @header
- [ ] Fragment blast radius undercount on multi-locale sites

## 55. Locale picker vs target locale subset (2 cases)

- [ ] Single-locale target active — picker still shows all site locales (gap)
- [ ] Picker should disable/hide locales not in active target's subset

## 56. System pages (404) with locale (2 cases)

- [ ] /fr/nonexistent → should serve French 404 page if page.fr.json exists
- [ ] /fr/nonexistent → fallback to English 404 if no French 404

## 57. Preview POST overrides with locale (1 case)

- [ ] POST /preview/fr/ with overrides applies to French manifest, not English

## 58. SEO metadata editor locale isolation (1 case)

- [ ] Switch locale in metadata editor — dirty flag resets, French metadata loads

## 59. Non-ASCII content in locale files (1 case)

- [ ] French accents, CJK characters in content fields — publish renders UTF-8 correctly

## 60. renderFragment hardcodes lang="en" (1 case)

- [!] **BUG: `renderFragment` outputs `<html lang="en">` regardless of locale** — fragment preview always English lang

## 61. Locale cookie never set (2 cases)

- [ ] **GAP: serve.ts reads `locale` cookie but never sets it** — per design, visiting /fr/about should set `Set-Cookie: locale=fr`
- [ ] **GAP: Worker reads cookie but never sets it** — same issue

## 62. publishPageAllLocales ignores target locale subset (2 cases)

- [!] **BUG: publishes ALL site locales, not filtered by target's `locales` config**
- [ ] Target with `locales: [fr]` still gets English + French published (should be French only)

## 63. No language switcher on public site (1 case)

- [ ] Starter has no language switcher template — visitors must type /fr/ URL manually

## 64. Internal links and locale prefixes (4 cases)

- [ ] Fragment fallback: English header on French page has `/about` links (not `/fr/about`)
- [ ] French header fragment with `/fr/about` links — must exist for correct navigation
- [ ] Templates receive no locale context — can't auto-prefix internal links
- [ ] Starter missing French header/footer fragments — fallback links break locale navigation

## 65. Locale normalization consistency (2 cases)

- [ ] All entry points normalize: config, CLI --to, ?locale=, URL prefix, filenames
- [ ] BCP 47 region codes: pt-BR/en-GB consistent across API, CLI, URL, filesystem

---

## Bug summary

| # | Bug | File | Line | Severity |
|---|-----|------|------|----------|
| 1 | PUT pages writes to page.json ignoring ?locale= | pages.ts | 124 | Critical |
| 2 | PUT fragments writes to fragment.json ignoring ?locale= | fragments.ts | ~95 | Critical |
| 3 | Client api.updatePage() never sends ?locale= param | client.ts | 208 | Critical |
| 4 | Client api.updateFragment() never sends ?locale= param | client.ts | 222 | Critical |
| 5 | buildSaveFn closure captures no locale context | useEditorActions.ts | 99 | Critical |
| 6 | DELETE pages doesn't delete locale files | pages.ts | 155 | High |
| 7 | DELETE fragments doesn't delete locale files | fragments.ts | ~127 | High |
| 8 | hreflang alternates never populated in publish | publish-rendered.ts | — | High |
| 9 | Sitemap hreflangGroups never computed | publish/sitemap | — | High |
| 10 | Cache purge only purges default locale URLs | publish.ts | 409 | High |
| 11 | Incremental publish doesn't detect locale file changes | compare.ts | — | High |
| 12 | Compare ignores locale variants | compare.ts | — | Medium |
| 13 | renderFragment hardcodes lang="en" | renderer.ts | 33 | Medium |
| 14 | publishPageAllLocales ignores target locale subset | publish-locale.ts | 61 | High |
| 15 | /fr/ trailing slash → 404 (inconsistent with /fr → 200) | cli/index.ts | — | Medium |
| 16 | /fr/blog/hello-world → 404 (dynamic route locale fallback missing on dev server) | cli/index.ts | — | Medium |
| 17 | ?locale=FR not normalized, ?locale=xx silently accepted, ?locale= empty not stripped | pages.ts | — | Medium |
| 18 | ?locale= dropped by 7 router.push() calls across admin UI | SiteTree, CmsToolbar, EditorView, EditorPanel, PreviewPanel, ActiveTargetIndicator | — | High |
| 19 | Progress stream missing locale field | publish.ts | — | Low |
| 20 | History doesn't record save locale | history-recorder.ts | — | Low |

## Gap summary by severity

| Priority | Count | Examples |
|----------|-------|---------|
| Critical (blocks editor use) | 7 | Save to wrong file (server + client), delete orphans locale files |
| High (incorrect output) | 5 | hreflang never wired, cache purge misses locales, incremental publish blind, target subset ignored |
| High (feature interactions) | 12 | Component ops independence, metadata per locale, multi-target subset |
| Medium (compare/publish/history) | 10 | Compare ignores locales, target locale subset, history locale |
| Medium (error/edge cases) | 15 | URL edge cases, migration, concurrent ops, error handling |
| Low (polish) | 18 | Progress stream, editor mount locale, watcher, normalization |
| Test-only (code works, needs test) | 62 | File discovery, resolver chains, worker paths, ESI assembly, hash |
