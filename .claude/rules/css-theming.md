# CSS and Theming (apps/admin)

How the admin SPA handles colors, dark mode, and design tokens. Audit snapshot + target shape.

## Current state (as of 2026-04-14)

- **20 style blocks** across 15 Vue components (14 `<style scoped>`, 6 unscoped)
- **74 unique hex values**, **273 total occurrences** — heavy duplication (e.g. `#450a0a` appears 6× for error backgrounds across 3 components)
- **No formal methodology** — BEM-adjacent naming (`.publish-warning`, `.changes-state`), no utility layer, no spacing/radius scale
- **No `var(--p-*)` usage** — PrimeVue emits 595 design tokens but the admin consumes zero of them

## PrimeVue design tokens (Aura)

PrimeVue v4 + Aura emits semantic + primitive tokens to `:root`. Verified live:

**Semantic tokens — auto-flip on `.dark` class:**

| Token | Light | Dark |
|---|---|---|
| `--p-text-color` | `#334155` | `#ffffff` |
| `--p-text-muted-color` | `#64748b` | `#a1a1aa` |
| `--p-content-background` | `#ffffff` | `#18181b` |
| `--p-content-hover-background` | `#f1f5f9` | `#27272a` |
| `--p-content-border-color` | `#e2e8f0` | `#3f3f46` |
| `--p-form-field-background` | `#ffffff` | `#09090b` |
| `--p-form-field-border-color` | `#cbd5e1` | `#52525b` |
| `--p-primary-color` | `#10b981` | `#34d399` |

**Primitive palette — does NOT flip:**

`--p-red-50..950`, `--p-green-*`, `--p-amber-*`, `--p-blue-*`, `--p-gray-*`, `--p-slate-*`, `--p-zinc-*`, etc. Each palette goes 50→950 (eleven shades). Stable across modes.

**Radii:** `--p-border-radius-none/xs/sm/md/lg/xl` (six variants). Reuse these — do not invent new radius tokens.

## Theme switching

`useThemeStore.apply()` toggles BOTH `dark` and `light` classes on `<html>` (commit 773248f). PrimeVue is configured with `darkModeSelector: '.dark'`, so `--p-*` semantic tokens flip automatically.

**Important:** `.light` selectors in component CSS ARE live. `.dark` selectors ARE live. Only one class is ever active at a time.

## Target token structure

When refactoring, layer app-level semantic tokens on top of PrimeVue primitives in a single `apps/admin/src/client/assets/tokens.css`:

```css
/* Auto-flip aliases of PrimeVue semantic tokens — no explicit .dark needed */
:root {
  --color-bg: var(--p-content-background);
  --color-fg: var(--p-text-color);
  --color-muted: var(--p-text-muted-color);
  --color-border: var(--p-content-border-color);
  --color-hover-bg: var(--p-content-hover-background);
  --color-input-bg: var(--p-form-field-background);
  --color-input-border: var(--p-form-field-border-color);
  --color-primary: var(--p-primary-color);
}

/* Status tokens — explicit light/dark since palette primitives don't flip */
:root {
  --color-danger-bg: var(--p-red-50);
  --color-danger-fg: var(--p-red-700);
  --color-success-bg: var(--p-green-50);
  --color-success-fg: var(--p-green-700);
  --color-warning-bg: var(--p-amber-50);
  --color-warning-fg: var(--p-amber-900);
  --color-info-bg: var(--p-blue-50);
  --color-info-fg: var(--p-blue-900);
  --color-env-prod-bg: var(--p-red-100);
  --color-env-prod-fg: var(--p-red-800);
  --color-env-staging-bg: var(--p-amber-100);
  --color-env-staging-fg: var(--p-amber-800);
}
.dark {
  --color-danger-bg: var(--p-red-950);
  --color-danger-fg: var(--p-red-300);
  --color-success-bg: var(--p-green-950);
  --color-success-fg: var(--p-green-400);
  --color-warning-bg: var(--p-amber-950);
  --color-warning-fg: var(--p-amber-300);
  --color-info-bg: var(--p-blue-950);
  --color-info-fg: var(--p-blue-300);
  --color-env-prod-bg: var(--p-red-950);
  --color-env-prod-fg: var(--p-red-300);
  --color-env-staging-bg: var(--p-amber-950);
  --color-env-staging-fg: var(--p-amber-300);
}
```

~50 LOC, ~20 custom tokens. Aliases (8) need no dual definition. Status + env (12) need `:root` + `.dark`.

## Do and don't

**Do:**
- Consume PrimeVue semantic tokens (`var(--p-text-color)` etc.) directly in component CSS when the intent matches
- Use `var(--p-border-radius-sm/md/lg)` instead of raw `4px/6px/8px`
- Use `var(--p-red-*)` and siblings as primitive references inside `tokens.css`
- Add new semantic tokens (`--color-nav-active-bg`) when a color appears in 3+ places

**Don't:**
- Apply theme tokens via JS runtime (`:style="themeVars"`). The current `themeVars` blocks in EditorPanel.vue and DevPlayground.vue are **tech debt** — 54 LOC of duplicated JS — slated for removal
- Invent `--app-*` or `--theme-*` prefixes. Use `--color-*` for colors; reuse `--p-*` directly for structural primitives (radii, spacing)
- Hard-code hex values for status/semantic concepts (error, success, info) — always via tokens
- Add `.dark .foo` / `.light .foo` overrides when a token would flip automatically (use `var(--color-*)` instead)

## Specificity and scoping

Vue SFC `<style scoped>` adds `[data-v-xxx]` attribute selectors. `.dark` and `.light` selectors in a scoped block keep their specificity — they work. But for simplicity, put `.dark .foo` overrides in an unscoped `<style>` block at the bottom of the SFC (existing convention in PublishDialog, ChangesDrawer).

Only 8 `:global(.dark)` uses in the entire codebase — not a systemic pattern. Avoid adding more.

## `--gz-*` legacy tokens

14 `--gz-*` tokens (`--gz-bg-input`, `--gz-text`, `--gz-border`, `--gz-accent`, etc.) are defined twice — once in EditorPanel.vue, once in DevPlayground.vue, both via JS `themeVars` computed applied to `:style`. They're consumed by:

- [packages/gazetta/src/editor/mount.tsx](packages/gazetta/src/editor/mount.tsx) — the `.gz-editor` stylesheet for the rjsf editor shell
- [examples/starter/admin/fields/brand-color.tsx](examples/starter/admin/fields/brand-color.tsx) — custom field using `var(--gz-accent, fallback)` pattern

When refactoring, move these to `tokens.css` with the new `--color-*` names; rewrite mount.tsx and brand-color.tsx to use the new names. No backwards-compat constraint.

## Don't use

- **Tailwind / UnoCSS** — overkill for ~350 LOC of component CSS
- **CSS Modules** — Vue `<style scoped>` is equivalent
- **Pinia-driven runtime theming** — JS-applied styles can't participate in `:hover`, `@media`, or CSS animations cheaply, and they duplicate what PrimeVue's `.dark` class already does
- **Custom radius/spacing scales** — PrimeVue's are fine

## Verification notes

All PrimeVue token behaviors in this doc were verified live against the running dev server (chromium + `getComputedStyle(document.documentElement)`), not from documentation. If PrimeVue upgrades change token emission, re-run the check.
