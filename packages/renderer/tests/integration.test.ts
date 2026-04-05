import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { loadSite } from '../src/site-loader.js'
import { resolvePage } from '../src/resolver.js'
import { renderComponent, renderPage } from '../src/renderer.js'

const starterDir = resolve(import.meta.dirname, '../../../examples/starter')

describe('starter site', () => {
  it('loads the site', async () => {
    const site = await loadSite(starterDir)
    expect(site.manifest.name).toBe('Gazetta Starter')
    expect(site.pages.size).toBe(2)
    expect(site.fragments.size).toBe(2)
    expect(site.pages.has('home')).toBe(true)
    expect(site.pages.has('about')).toBe(true)
    expect(site.fragments.has('header')).toBe(true)
    expect(site.fragments.has('footer')).toBe(true)
  })

  it('resolves and renders the home page', async () => {
    const site = await loadSite(starterDir)
    const resolved = await resolvePage('home', site)
    const html = renderPage(resolved, site.pages.get('home')!.metadata)

    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<title>Home</title>')

    // Header fragment (logo + nav)
    expect(html).toContain('Gazetta')
    expect(html).toContain('href="/"')
    expect(html).toContain('href="/about"')

    // Hero component
    expect(html).toContain('Welcome to Gazetta')
    expect(html).toContain('composable components')

    // Footer fragment
    expect(html).toContain('© 2026 Gazetta')
  })

  it('resolves and renders the about page', async () => {
    const site = await loadSite(starterDir)
    const resolved = await resolvePage('about', site)
    const html = renderPage(resolved, site.pages.get('about')!.metadata)

    expect(html).toContain('<title>About</title>')

    // Same header fragment as home
    expect(html).toContain('Gazetta')
    expect(html).toContain('href="/about"')

    // About text component
    expect(html).toContain('About Gazetta')
    expect(html).toContain('stateless CMS')

    // Same footer fragment as home
    expect(html).toContain('© 2026 Gazetta')
  })

  it('shared fragments produce identical output across pages', async () => {
    const site = await loadSite(starterDir)
    const homeResolved = await resolvePage('home', site)
    const aboutResolved = await resolvePage('about', site)

    const homeHeader = renderComponent(homeResolved.children[0])
    const aboutHeader = renderComponent(aboutResolved.children[0])
    expect(homeHeader.html).toBe(aboutHeader.html)

    const homeFooter = renderComponent(homeResolved.children[homeResolved.children.length - 1])
    const aboutFooter = renderComponent(aboutResolved.children[aboutResolved.children.length - 1])
    expect(homeFooter.html).toBe(aboutFooter.html)
  })

  it('page has correct component tree structure', async () => {
    const site = await loadSite(starterDir)
    const resolved = await resolvePage('home', site)

    // page-default wraps: @header, hero, @footer
    expect(resolved.children).toHaveLength(3)

    // header is composite with logo + nav
    const header = resolved.children[0]
    expect(header.children).toHaveLength(2)

    // hero is a leaf
    const hero = resolved.children[1]
    expect(hero.children).toHaveLength(0)
    expect(hero.content?.title).toBe('Welcome to Gazetta')

    // footer is composite with copyright
    const footer = resolved.children[2]
    expect(footer.children).toHaveLength(1)
  })

  it('renders valid HTML document', async () => {
    const site = await loadSite(starterDir)
    const resolved = await resolvePage('home', site)
    const html = renderPage(resolved, site.pages.get('home')!.metadata)

    expect(html).toMatch(/^<!DOCTYPE html>/)
    expect(html).toContain('<html lang="en">')
    expect(html).toContain('<meta charset="UTF-8">')
    expect(html).toContain('<style>')
    expect(html).toContain('</html>')
  })
})
