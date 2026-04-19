# i18n Test Plan

Comprehensive verification plan for the i18n feature (PR #190). Covers both
deployment strategies, all runtime modes, edge cases, and known bugs.

**Status legend:** [ ] not tested · [x] verified · [~] partial · [!] bug

**Summary:** 192 use cases — 108 verified, 9 bugs, 75 gaps.

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

## 14. Admin UI — URL persistence (5 cases)

- [x] `?locale=fr` persists on page refresh
- [x] `?locale=fr` persists when navigating between pages
- [x] `?locale=fr` combined with `?target=staging`
- [x] `#hash` preserved when switching locale
- [x] `?locale=fr` + `#hero` in URL at same time

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

## Bug summary

| # | Bug | File | Line | Severity |
|---|-----|------|------|----------|
| 1 | PUT pages writes to page.json ignoring ?locale= | pages.ts | 124 | Critical |
| 2 | PUT fragments writes to fragment.json ignoring ?locale= | fragments.ts | ~95 | Critical |
| 3 | DELETE pages doesn't delete locale files | pages.ts | 155 | High |
| 4 | DELETE fragments doesn't delete locale files | fragments.ts | ~127 | High |
| 5 | hreflang alternates never populated in publish | publish-rendered.ts | — | High |
| 6 | Sitemap hreflangGroups never computed | publish/sitemap | — | High |
| 7 | Compare ignores locale variants | compare.ts | — | Medium |
| 8 | Progress stream missing locale field | publish.ts | — | Low |
| 9 | History doesn't record save locale | history-recorder.ts | — | Low |

## Gap summary by severity

| Priority | Count | Examples |
|----------|-------|---------|
| Critical (blocks editor use) | 4 | Save to wrong file, delete orphans locale files |
| High (incorrect SEO output) | 2 | hreflang never wired, sitemap hreflang empty |
| Medium (compare/publish) | 4 | Compare ignores locales, target locale subset |
| Low (polish) | 7 | Progress stream, history locale, edge cases |
| Test-only (code works, needs test) | 58 | File discovery, resolver chains, worker paths |
