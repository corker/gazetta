import { describe, it, expect } from 'vitest'
import { generateRobotsTxt } from '../src/robots.js'

describe('generateRobotsTxt', () => {
  it('generates permissive default with Sitemap when baseUrl is set', () => {
    const txt = generateRobotsTxt({ baseUrl: 'https://example.com' })
    expect(txt).toContain('User-agent: *')
    expect(txt).toContain('Allow: /')
    expect(txt).toContain('Sitemap: https://example.com/sitemap.xml')
  })

  it('omits Sitemap line when baseUrl is absent', () => {
    const txt = generateRobotsTxt({})
    expect(txt).toContain('User-agent: *')
    expect(txt).toContain('Allow: /')
    expect(txt).not.toContain('Sitemap')
  })

  it('ends with a newline', () => {
    const txt = generateRobotsTxt({})
    expect(txt.endsWith('\n')).toBe(true)
  })
})
