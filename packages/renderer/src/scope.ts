let counter = 0

export function generateScopeId(): string {
  return 'gz' + (counter++).toString(36)
}

export function resetScopeCounter(): void {
  counter = 0
}

/**
 * Wraps HTML in a scoped container with a data-gz attribute.
 * Templates output raw HTML — scoping wraps it so CSS can target it.
 */
export function scopeHtml(html: string, scopeId: string): string {
  return `<div data-gz="${scopeId}">${html}</div>`
}

/**
 * Prefixes CSS selectors with a scope attribute selector.
 * Handles common cases: class, id, element, combinators.
 * Preserves @-rules (media queries, keyframes, font-face, etc.)
 *
 * ".hero { ... }"  →  "[data-gz=abc] .hero { ... }"
 */
export function scopeCss(css: string, scopeId: string): string {
  if (!css.trim()) return ''

  const prefix = `[data-gz="${scopeId}"]`

  return css.replace(
    /([^{}]+)\{/g,
    (match, selectors: string) => {
      const trimmed = selectors.trim()
      // Don't prefix @-rules (media queries, keyframes, etc.)
      if (trimmed.startsWith('@')) return match

      const scoped = selectors
        .split(',')
        .map((sel: string) => {
          const s = sel.trim()
          if (!s) return sel
          // Don't prefix selectors inside @keyframes (from, to, percentages)
          if (/^(from|to|\d+%)$/.test(s)) return sel
          return `${prefix} ${s}`
        })
        .join(', ')

      return `${scoped} {`
    }
  )
}
