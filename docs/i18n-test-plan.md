# i18n Test Plan

Comprehensive verification plan for the i18n feature (PR #190). Covers both
deployment strategies, all runtime modes, and edge cases.

**Status legend:** [ ] not tested · [x] verified · [~] partial

---

## 1. Automated tests (run `npm test`)

### 1.1 Core locale logic — `locale.test.ts` (48 tests)

- [x] normalizeLocale: lowercases simple and region codes
- [x] resolveSiteLocales: null when no config, explicit default, first-in-list default, normalization
- [x] resolveTargetLocales: inheritance from site, narrowing, single-locale inference
- [x] localeFromFilename: extracts locale from page.fr.json, null for page.json
- [x] localeFilename: generates page.fr.json from (page, fr)
- [x] resolveLocaleFallback: exact match, chain walk, default fallback
- [x] localeRoutePrefix: empty for default, /fr for non-default, /en when defaultPrefix=true
- [x] hreflang in resolveSeoTags: 2+ alternates, x-default, self-reference, escaping

### 1.2 Serve locale routing — `serve-locale.test.ts` (30 tests)

- [x] extractLocale: known prefix, region code, unknown prefix, empty list, root, deep paths
- [x] matchAcceptLanguage: exact match, base language, quality ordering, no match, region fallback
- [x] findPage with locales: default page, locale-suffixed file, fallback to default, dynamic routes
- [x] Accept-Language redirect: best match 302, default locale no redirect, no header no redirect,
      already-prefixed path no redirect, detection disabled no redirect, cookie override
- [x] Fragment locale fallback: falls back to default when locale file missing, uses locale when present

### 1.3 Publish locale — `publish-locale.test.ts` (9 tests)

- [x] ESI page writes index.fr.html (not index.html)
- [x] Default locale writes index.html
- [x] Locale and default do not overwrite each other
- [x] ESI fragment references include locale suffix in placeholders
- [x] Fragment writes locale-suffixed file (index.fr.html)
- [x] Default and locale fragments coexist
- [x] Static mode writes to locale-prefixed URL path (fr/about/index.html)
- [x] Static default and locale pages coexist
- [x] Home locale page writes to locale root (fr/index.html)

### 1.4 Sitemap hreflang — `sitemap.test.ts` (3 i18n tests)

- [x] Includes hreflang cross-links when 2+ alternates exist (xhtml:link)
- [x] Omits hreflang when only one alternate
- [x] Omits hreflang when no groups provided

### 1.5 Admin API locale — `api.test.ts` (9 i18n tests)

- [x] Page list includes locales array for translated pages
- [x] Pages without translations have empty/no locales array
- [x] GET /api/pages/:name returns default when no locale param
- [x] GET /api/pages/:name?locale=fr returns locale-specific content
- [x] Falls back to default when requested locale unavailable
- [x] Fragment list returns successfully
- [x] Preview renders home at locale-prefixed URL (/preview/fr)
- [x] Preview renders about with locale prefix (/preview/fr/about)
- [x] Site manifest includes locales config

### 1.6 CLI translate — `cli.test.ts` (3 tests)

- [x] Copies page.json to page.de.json
- [x] Refuses to overwrite existing locale file
- [x] Errors on missing source file

### 1.7 Resolver fallback — `resolver.test.ts` (4 i18n tests)

- [x] Fragment locale resolution with fallback chain

### 1.8 Existing tests (regression — all must still pass)

- [x] integration.test.ts: starter site loads with project-level manifest
- [x] publish.test.ts: all publish functions pass site/manifest correctly
- [x] history.test.ts: history works with manifest on source context
- [x] docker.test.ts: MinIO publish with locale-aware functions

---

## 2. Deployment strategy 1 — Subpath routing (one domain, all locales)

```yaml
# Config shape
locale: en
locales:
  supported: [en, fr]
targets:
  local:
    storage: { type: filesystem }
    # inherits all site locales, default = en
```

### 2.1 Dev server preview (manual)

- [ ] `GET /preview/` — English home page
- [ ] `GET /preview/fr` — French home page ("Bienvenue sur Gazetta")
- [ ] `GET /preview/about` — English about page
- [ ] `GET /preview/fr/about` — French about page
- [ ] `GET /preview/blog/hello-world` — English blog (no French variant, renders English)
- [ ] `GET /preview/fr/blog/hello-world` — French blog fallback (renders English content)
- [ ] `GET /preview/@header` — English header fragment
- [ ] `GET /preview/fr/@header` — French header fragment (or English fallback)

### 2.2 Published ESI mode (`gazetta serve`, dynamic target)

- [ ] Publish home → creates `pages/home/index.html` + `pages/home/index.fr.html`
- [ ] Publish header fragment → creates `fragments/header/index.html` + `fragments/header/index.fr.html`
- [ ] `GET /` → assembles English page with English fragments
- [ ] `GET /fr` → assembles French page with French fragment ESI refs
- [ ] `GET /fr` when fragment.fr.html missing → falls back to fragment index.html
- [ ] `GET /about` → English about
- [ ] `GET /fr/about` → French about
- [ ] `GET /nonexistent` → 404
- [ ] `GET /fr/nonexistent` → 404
- [ ] `<html lang="en">` on English pages, `<html lang="fr">` on French pages

### 2.3 Published static mode (`publishPageStatic`)

- [ ] Publish home → creates `index.html` (English) + `fr/index.html` (French)
- [ ] Publish about → creates `about/index.html` + `fr/about/index.html`
- [ ] All fragments baked inline (no ESI placeholders)
- [ ] Static file server can serve both paths without runtime

### 2.4 hreflang (subpath — HTML head injection)

- [ ] English page has `<link rel="alternate" hreflang="en" href="https://example.com/about">`
- [ ] English page has `<link rel="alternate" hreflang="fr" href="https://example.com/fr/about">`
- [ ] English page has `<link rel="alternate" hreflang="x-default" href="https://example.com/about">`
- [ ] French page has same three hreflang links (self-referencing required by Google)
- [ ] Page with only one locale — no hreflang tags
- [ ] Page with `metadata.robots: "noindex"` on French variant — French excluded from hreflang group

### 2.5 Sitemap (subpath)

- [ ] sitemap.xml includes `https://example.com/about` and `https://example.com/fr/about`
- [ ] Each `<url>` has `<xhtml:link>` cross-referencing all locale variants
- [ ] Dynamic routes (`/blog/:slug`) excluded
- [ ] Noindex pages excluded
- [ ] `<lastmod>` per locale variant from `.pub` sidecar timestamp

### 2.6 defaultPrefix: true

- [ ] Default locale gets prefix: `/en/about` instead of `/about`
- [ ] French: `/fr/about` (same as before)
- [ ] Root: `/en` (English home), `/fr` (French home)
- [ ] hreflang hrefs include `/en/` prefix for default locale
- [ ] Sitemap URLs include `/en/` prefix

---

## 3. Deployment strategy 2 — Per-domain (separate domains per locale)

```yaml
locale: en
locales:
  supported: [en, fr]
targets:
  production-en:
    storage: { type: r2, bucket: site-en }
    locales: [en]
    siteUrl: https://example.com
  production-fr:
    storage: { type: r2, bucket: site-fr }
    locales: [fr]
    siteUrl: https://example.fr
```

### 3.1 Target locale resolution

- [ ] `target.locales: [fr]` → single-locale target, infers `locale: fr`
- [ ] Single-locale target: `defaultPrefix` forced to false (no prefix needed)
- [ ] Single-locale target: `detection` forced to false (nothing to detect)
- [ ] Target inherits site locales when no override

### 3.2 Publish per-domain

- [ ] Publish to `production-en` → only English pages rendered
- [ ] Publish to `production-fr` → only French pages rendered
- [ ] Each target gets its own `index.html` (no locale suffix — single-locale)
- [ ] Page with no French variant → skipped on `production-fr` target
- [ ] Fragments: only default `index.html` per target (single-locale, no suffix)

### 3.3 hreflang (per-domain — sitemap only, not HTML)

- [ ] HTML `<head>` has NO hreflang (single-locale target)
- [ ] Sitemap on `example.com` includes:
      `<xhtml:link hreflang="en" href="https://example.com/about">`
      `<xhtml:link hreflang="fr" href="https://example.fr/about">`
- [ ] Sitemap on `example.fr` includes same cross-links (bidirectional)
- [ ] `x-default` points to the site-level default locale's `siteUrl`
- [ ] Sitemap regenerated after all targets published (timing safety)

### 3.4 Per-domain with locale subset

```yaml
targets:
  production-de:
    locales: [de, en]
    locale: de
    siteUrl: https://example.de
```

- [ ] `/about` serves German (de is default, no prefix)
- [ ] `/en/about` serves English (secondary locale, prefixed)
- [ ] hreflang includes both locales
- [ ] Sitemap includes cross-domain links to other targets

---

## 4. Deployment strategy 3 — Hybrid (dev subpath, prod per-domain)

```yaml
targets:
  local:
    storage: { type: filesystem }
    # all locales via subpath
  production-en:
    locales: [en]
    siteUrl: https://example.com
  production-fr:
    locales: [fr]
    siteUrl: https://example.fr
```

- [ ] Local target: subpath routing works (all locales accessible)
- [ ] Prod targets: single-locale per target
- [ ] Publish to local: writes locale-suffixed files
- [ ] Publish to prod-en: writes only English
- [ ] Publish to prod-fr: writes only French
- [ ] Compare local vs prod-en: shows French as "ahead" (not on prod-en)

---

## 5. Accept-Language detection + redirect

### 5.1 Detection enabled (subpath target)

```yaml
locales:
  supported: [en, fr, de]
  detection: true
```

- [ ] `GET /about` + `Accept-Language: fr-FR,fr;q=0.9` → 302 to `/fr/about`
- [ ] `GET /about` + `Accept-Language: en-US` → no redirect (default locale)
- [ ] `GET /about` + no header → no redirect (serve default)
- [ ] `GET /about` + `Accept-Language: ja` → no redirect (no match)
- [ ] `GET /fr/about` + `Accept-Language: de` → no redirect (already locale-prefixed)
- [ ] 302 (not 301) — Google can crawl the default URL
- [ ] `GET /about` + `Cookie: locale=fr` → 302 to `/fr/about` (cookie override)
- [ ] `GET /about` + `Cookie: locale=invalid` → no redirect (unknown locale ignored)
- [ ] Quality ordering: `Accept-Language: en;q=0.5,de;q=0.9` → redirect to `/de/about`
- [ ] Region matching: `Accept-Language: de-AT` + locales `[de]` → matches base `de`

### 5.2 Detection disabled

- [ ] `locales.detection: false` → no redirect regardless of Accept-Language
- [ ] Target override: site `detection: true`, target `detection: false` → no redirect on that target

### 5.3 Per-domain targets (detection N/A)

- [ ] Single-locale target: detection forced off
- [ ] No redirect on per-domain targets (domain itself determines locale)

---

## 6. Cloudflare Worker (edge runtime)

### 6.1 ESI assembly with locale

- [ ] Worker reads `pages/home/index.fr.html` for `/fr` request
- [ ] Worker resolves `<!--esi:/fragments/header/index.fr.html-->` from R2
- [ ] Fragment locale fallback: `index.fr.html` missing → reads `index.html`
- [ ] Missing fragment → comment placeholder `<!-- fragment not found -->`
- [ ] Cache key includes locale (different cache entry per locale)

### 6.2 Cache purge

- [ ] Publish page (all locales) → purges all locale URLs from CDN
- [ ] Purge `/about` AND `/fr/about` when English about is published
- [ ] Per-domain target: purge only that domain's URLs

---

## 7. Admin UI (manual browser verification)

### 7.1 Locale picker

- [ ] EN and FR buttons visible in toolbar
- [ ] EN active by default (green)
- [ ] Click FR → FR becomes active, URL changes to `?locale=fr`
- [ ] Click EN → `?locale=` removed from URL
- [ ] Picker hidden when site has no `locales` config
- [ ] Picker shows all supported locales (not just two)

### 7.2 Site tree locale badges

- [ ] Pages with translations show locale badges (e.g., home [FR])
- [ ] Pages without translations show no badges
- [ ] Fragments with translations show locale badges
- [ ] System pages (404) show no badges
- [ ] Badges visible in both light and dark themes

### 7.3 Preview locale switching

- [ ] Select home → English preview ("Welcome to Gazetta")
- [ ] Click FR → French preview ("Bienvenue sur Gazetta", "Pourquoi Gazetta ?", "Clics")
- [ ] Click EN → back to English
- [ ] Select about → click FR → French about content
- [ ] Page without FR (blog/[slug]) → click FR → English fallback
- [ ] Preview `<html lang>` attribute matches selected locale

### 7.4 Editor with locale

- [ ] Select home → hero component → English content in form
- [ ] Click FR → form reloads with French content ("Bienvenue sur Gazetta")
- [ ] Edit French field → preview updates with draft content
- [ ] Save → writes to page.fr.json (not page.json)
- [ ] Click EN → form returns to English content
- [ ] Unsaved changes guard fires when switching locale with dirty form

### 7.5 URL persistence

- [ ] `?locale=fr` persists on page refresh
- [ ] `?locale=fr` persists when navigating between pages
- [ ] `?locale=fr` combined with `?target=staging` → both preserved
- [ ] `#hero` hash preserved when switching locale

### 7.6 Publish with locale

- [ ] Publish button publishes all locale variants
- [ ] Progress stream shows per-locale file counts
- [ ] Compare shows locale-specific changes ("about (fr) ahead of staging")

---

## 8. CLI commands

### 8.1 `gazetta translate`

- [ ] `gazetta translate pages/about --to fr` → creates page.fr.json
- [ ] `gazetta translate fragments/header --to de` → creates fragment.de.json
- [ ] `gazetta translate pages/about --to fr local` → uses local target's content root
- [ ] Refuses to overwrite existing locale file
- [ ] Errors on missing source page
- [ ] Normalizes locale code (`--to FR` → `page.fr.json`)
- [ ] Region code: `--to en-GB` → `page.en-gb.json`

### 8.2 `gazetta publish` with locales

- [ ] `gazetta publish production` → publishes all pages × all locale variants
- [ ] Target with `locales: [fr]` → only French variants published
- [ ] Progress output shows locale counts
- [ ] `--force` re-publishes all locales even if unchanged

### 8.3 `gazetta validate` (locale checks — future)

- [ ] Warns about `page.en.json` when `en` is the default locale (ambiguous)
- [ ] Warns about orphaned locale files (site has no `locales` config)
- [ ] Warns about pages missing on target's locale subset
- [ ] Detects circular fallback chains

---

## 9. Locale fallback chain

### 9.1 Page content fallback

- [ ] Page locale variant exists → uses locale content
- [ ] Page locale variant missing → uses default page content
- [ ] BCP 47 chain: `pt-BR` → `pt` → default (via `locales.fallbacks`)

### 9.2 Fragment content fallback (resolve time)

- [ ] Fragment locale variant exists → uses locale content
- [ ] Fragment locale variant missing → walks fallback chain
- [ ] Fallback chain exhausted → uses default fragment
- [ ] Mixed: French page with English fragment (fragment.fr.json missing) → renders without error

### 9.3 Fragment ESI fallback (serve time)

- [ ] `index.fr.html` exists → served
- [ ] `index.fr.html` missing → falls back to `index.html`
- [ ] Both missing → `<!-- fragment not found -->` comment injected
- [ ] Region code: `index.pt-br.html` fallback regex works

---

## 10. Edge cases

### 10.1 Config edge cases

- [ ] No `locales` in site.yaml → i18n disabled, single-locale site works as before
- [ ] Empty `locales.supported: []` → treated as no i18n
- [ ] `locale: en` without `locales.supported` → single-locale with explicit lang attribute
- [ ] `locales.fallbacks: { pt-br: pt, pt: pt-br }` → circular chain terminates (no infinite loop)
- [ ] `defaultPrefix: true` + `detection: true` → redirects to `/fr/about`, default at `/en/about`

### 10.2 File discovery edge cases

- [ ] `page.fr.json` with invalid JSON → skipped with warning, other locales still discovered
- [ ] Nested page: `blog/[slug]/page.fr.json` → discovered with route `/fr/blog/:slug`
- [ ] Fragment without default: only `fragment.fr.json` exists (no `fragment.json`) → still discoverable
- [ ] BCP 47 with region: `page.en-gb.json` → locale `en-gb` extracted correctly

### 10.3 Publish edge cases

- [ ] CSS/JS hashes shared across locales (same template → same hash)
- [ ] Old hashed files cleaned up across locale renders
- [ ] Sidecar per locale variant (`.pub` and `.pub.fr` timestamps differ)

### 10.4 Non-regression

- [ ] Sites without i18n config work exactly as before (no behavior change)
- [ ] Save on English page writes to page.json (not page.en.json)
- [ ] Target switching still works with locale picker active
- [ ] Theme toggle works with locale badges visible
- [ ] Publish panel works normally

---

## 11. Test matrix summary

| Area | Auto | Manual | Total |
|------|------|--------|-------|
| Locale resolution | 48 | — | 48 |
| Serve locale routing | 30 | — | 30 |
| Publish locale | 9 | 12 | 21 |
| Sitemap hreflang | 3 | 5 | 8 |
| Admin API locale | 9 | — | 9 |
| CLI translate | 3 | 4 | 7 |
| Resolver fallback | 4 | — | 4 |
| Admin UI | — | 20 | 20 |
| Accept-Language | 6 | 6 | 12 |
| Cloudflare Worker | — | 5 | 5 |
| Edge cases | — | 14 | 14 |
| Non-regression | ~700 | 5 | ~705 |
| **Total** | **~812** | **~71** | **~883** |
