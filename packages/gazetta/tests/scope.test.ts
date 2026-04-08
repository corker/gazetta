import { describe, it, expect } from 'vitest'
import { scopeHtml, scopeCss, hashPath } from '../src/scope.js'

describe('hashPath', () => {
  it('generates 8-char hex string', () => {
    expect(hashPath('hero')).toMatch(/^[a-f0-9]{8}$/)
  })

  it('is deterministic', () => {
    expect(hashPath('hero')).toBe(hashPath('hero'))
    expect(hashPath('@header/logo')).toBe(hashPath('@header/logo'))
  })

  it('different paths produce different hashes', () => {
    const ids = new Set([
      hashPath('hero'),
      hashPath('@header'),
      hashPath('@header/logo'),
      hashPath('features/fast'),
      hashPath('@footer'),
    ])
    expect(ids.size).toBe(5)
  })

  it('handles empty string', () => {
    expect(hashPath('')).toMatch(/^[a-f0-9]{8}$/)
  })
})

describe('scopeHtml', () => {
  it('wraps html in a scoped div', () => {
    expect(scopeHtml('<p>hello</p>', 'abc12345')).toBe('<div data-gz="abc12345"><p>hello</p></div>')
  })

  it('returns empty string for empty html', () => {
    expect(scopeHtml('', 'abc12345')).toBe('')
  })
})

describe('scopeCss', () => {
  it('prefixes class selectors', () => {
    const result = scopeCss('.hero { color: red; }', 'abc12345')
    expect(result).toContain('[data-gz="abc12345"] .hero')
  })

  it('prefixes element selectors', () => {
    const result = scopeCss('p { margin: 0; }', 'abc12345')
    expect(result).toContain('[data-gz="abc12345"] p')
  })

  it('prefixes id selectors', () => {
    const result = scopeCss('#main { width: 100%; }', 'abc12345')
    expect(result).toContain('[data-gz="abc12345"] #main')
  })

  it('handles multiple selectors separated by comma', () => {
    const result = scopeCss('.a, .b { color: red; }', 'abc12345')
    expect(result).toContain('[data-gz="abc12345"] .a')
    expect(result).toContain('[data-gz="abc12345"] .b')
  })

  it('handles multiple rules', () => {
    const result = scopeCss('.a { color: red; } .b { color: blue; }', 'abc12345')
    expect(result).toContain('[data-gz="abc12345"] .a')
    expect(result).toContain('[data-gz="abc12345"] .b')
  })

  it('preserves @media rules', () => {
    const result = scopeCss('@media (max-width: 768px) { .hero { padding: 1rem; } }', 'abc12345')
    expect(result).toContain('@media')
    expect(result).toContain('[data-gz="abc12345"] .hero')
  })

  it('preserves @keyframes rules', () => {
    const result = scopeCss('@keyframes fade { from { opacity: 0; } to { opacity: 1; } }', 'abc12345')
    expect(result).toContain('@keyframes fade')
  })

  it('returns empty string for empty css', () => {
    expect(scopeCss('', 'abc12345')).toBe('')
    expect(scopeCss('   ', 'abc12345')).toBe('')
  })

  it('handles descendant selectors', () => {
    const result = scopeCss('.hero h1 { font-size: 2rem; }', 'abc12345')
    expect(result).toContain('[data-gz="abc12345"] .hero h1')
  })

  it('handles pseudo-classes', () => {
    const result = scopeCss('.link:hover { color: blue; }', 'abc12345')
    expect(result).toContain('[data-gz="abc12345"] .link:hover')
  })
})
