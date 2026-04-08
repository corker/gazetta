import postcss from 'postcss'
// @ts-expect-error no type declarations available
import prefixer from 'postcss-prefix-selector'

let counter = 0

export function generateScopeId(): string {
  return 'gz' + (counter++).toString(36)
}

export function resetScopeCounter(): void {
  counter = 0
}

/**
 * Wraps HTML in a scoped container with a data-gz attribute.
 */
export function scopeHtml(html: string, scopeId: string): string {
  if (!html.trim()) return ''
  return `<div data-gz="${scopeId}">${html}</div>`
}

/**
 * Prefixes CSS selectors with a scope attribute selector using PostCSS.
 * Handles all CSS edge cases: @-rules, combinators, pseudo-elements,
 * content strings, CSS nesting, attribute selectors.
 */
export function scopeCss(css: string, scopeId: string): string {
  if (!css.trim()) return ''

  const prefix = `[data-gz="${scopeId}"]`
  const result = postcss([
    prefixer({ prefix, transform: (_prefix: string, selector: string) => `${prefix} ${selector}` }),
  ]).process(css).css

  return result
}
