import { describe, it, expect, beforeEach } from 'vitest'
import { scopeHtml, scopeCss, generateScopeId, resetScopeCounter } from '../src/scope.js'

beforeEach(() => {
  resetScopeCounter()
})

describe('generateScopeId', () => {
  it('generates sequential ids', () => {
    expect(generateScopeId()).toBe('gz0')
    expect(generateScopeId()).toBe('gz1')
    expect(generateScopeId()).toBe('gz2')
  })

  it('resets counter', () => {
    generateScopeId()
    generateScopeId()
    resetScopeCounter()
    expect(generateScopeId()).toBe('gz0')
  })
})

describe('scopeHtml', () => {
  it('wraps html in a scoped div', () => {
    expect(scopeHtml('<p>hello</p>', 'gz0')).toBe('<div data-gz="gz0"><p>hello</p></div>')
  })

  it('returns empty string for empty html', () => {
    expect(scopeHtml('', 'gz0')).toBe('')
  })
})

describe('scopeCss', () => {
  it('prefixes class selectors', () => {
    const result = scopeCss('.hero { color: red; }', 'gz0')
    expect(result).toContain('[data-gz="gz0"] .hero')
  })

  it('prefixes element selectors', () => {
    const result = scopeCss('p { margin: 0; }', 'gz0')
    expect(result).toContain('[data-gz="gz0"] p')
  })

  it('prefixes id selectors', () => {
    const result = scopeCss('#main { width: 100%; }', 'gz0')
    expect(result).toContain('[data-gz="gz0"] #main')
  })

  it('handles multiple selectors separated by comma', () => {
    const result = scopeCss('.a, .b { color: red; }', 'gz0')
    expect(result).toContain('[data-gz="gz0"] .a')
    expect(result).toContain('[data-gz="gz0"] .b')
  })

  it('handles multiple rules', () => {
    const result = scopeCss('.a { color: red; } .b { color: blue; }', 'gz0')
    expect(result).toContain('[data-gz="gz0"] .a')
    expect(result).toContain('[data-gz="gz0"] .b')
  })

  it('preserves @media rules', () => {
    const result = scopeCss('@media (max-width: 768px) { .hero { padding: 1rem; } }', 'gz0')
    expect(result).toContain('@media')
    expect(result).toContain('[data-gz="gz0"] .hero')
  })

  it('preserves @keyframes rules', () => {
    const result = scopeCss('@keyframes fade { from { opacity: 0; } to { opacity: 1; } }', 'gz0')
    expect(result).toContain('@keyframes fade')
  })

  it('returns empty string for empty css', () => {
    expect(scopeCss('', 'gz0')).toBe('')
    expect(scopeCss('   ', 'gz0')).toBe('')
  })

  it('handles descendant selectors', () => {
    const result = scopeCss('.hero h1 { font-size: 2rem; }', 'gz0')
    expect(result).toContain('[data-gz="gz0"] .hero h1')
  })

  it('handles pseudo-classes', () => {
    const result = scopeCss('.link:hover { color: blue; }', 'gz0')
    expect(result).toContain('[data-gz="gz0"] .link:hover')
  })
})
