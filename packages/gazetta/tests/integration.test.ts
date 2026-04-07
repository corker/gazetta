import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { createFilesystemProvider } from '../src/providers/filesystem.js'
import { loadSite } from '../src/site-loader.js'
import { resolvePage } from '../src/resolver.js'
import { renderComponent, renderPage } from '../src/renderer.js'

const starterDir = resolve(import.meta.dirname, '../../../examples/starter')
const storage = createFilesystemProvider()

describe('starter site', () => {
  it('loads the site', async () => {
    const site = await loadSite(starterDir, storage)
    expect(site.manifest.name).toBe('Gazetta Starter')
    expect(site.pages.size).toBeGreaterThanOrEqual(3)
    expect(site.fragments.size).toBe(2)
    expect(site.pages.has('home')).toBe(true)
    expect(site.pages.has('about')).toBe(true)
    expect(site.pages.has('blog/[slug]')).toBe(true)
    expect(site.fragments.has('header')).toBe(true)
    expect(site.fragments.has('footer')).toBe(true)
  })

  it('resolves and renders the home page', async () => {
    const site = await loadSite(starterDir, storage)
    const resolved = await resolvePage('home', site)
    const html = await renderPage(resolved, site.pages.get('home')!.metadata)

    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<title>Home</title>')
    expect(html).toContain('Gazetta')
    expect(html).toContain('href="/"')
    expect(html).toContain('href="/about"')
    expect(html).toContain('Welcome to Gazetta')
    expect(html).toContain('composable components')
    expect(html).toContain('© 2026 Gazetta')
  })

  it('resolves and renders the about page', async () => {
    const site = await loadSite(starterDir, storage)
    const resolved = await resolvePage('about', site)
    const html = await renderPage(resolved, site.pages.get('about')!.metadata)

    expect(html).toContain('<title>About</title>')
    expect(html).toContain('About Gazetta')
    expect(html).toContain('stateless CMS')
    expect(html).toContain('© 2026 Gazetta')
  })

  it('shared fragments produce identical output across pages', async () => {
    const site = await loadSite(starterDir, storage)
    const homeResolved = await resolvePage('home', site)
    const aboutResolved = await resolvePage('about', site)

    const stripScope = (html: string) => html.replace(/data-gz="[^"]+"/g, 'data-gz=""')

    const homeHeader = stripScope((await renderComponent(homeResolved.children[0])).html)
    const aboutHeader = stripScope((await renderComponent(aboutResolved.children[0])).html)
    expect(homeHeader).toBe(aboutHeader)

    const homeFooter = stripScope((await renderComponent(homeResolved.children[homeResolved.children.length - 1])).html)
    const aboutFooter = stripScope((await renderComponent(aboutResolved.children[aboutResolved.children.length - 1])).html)
    expect(homeFooter).toBe(aboutFooter)
  })

  it('page has correct component tree structure', async () => {
    const site = await loadSite(starterDir, storage)
    const resolved = await resolvePage('home', site)

    // @header, hero, features, demo, @footer
    expect(resolved.children).toHaveLength(5)

    const header = resolved.children[0]
    expect(header.children).toHaveLength(2)

    const hero = resolved.children[1]
    expect(hero.children).toHaveLength(0)
    expect(hero.content?.title).toBe('Welcome to Gazetta')

    const features = resolved.children[2]
    expect(features.children).toHaveLength(3)

    // demo (counter) is a leaf
    const demo = resolved.children[3]
    expect(demo.children).toHaveLength(0)

    const footer = resolved.children[4]
    expect(footer.children).toHaveLength(1)
  })

  it('renders React SSR templates (feature cards)', async () => {
    const site = await loadSite(starterDir, storage)
    const resolved = await resolvePage('home', site)
    const html = await renderPage(resolved, site.pages.get('home')!.metadata)

    expect(html).toContain('Why Gazetta')
    expect(html).toContain('<div class="feature-card">')
    expect(html).toContain('Fast')
    expect(html).toContain('Composable')
    expect(html).toContain('Open Source')
    expect(html).toContain('Edge composition at request time')
  })

  it('discovers nested dynamic route pages', async () => {
    const site = await loadSite(starterDir, storage)
    const blogPage = site.pages.get('blog/[slug]')
    expect(blogPage).toBeDefined()
    expect(blogPage!.route).toBe('/blog/:slug')
  })

  it('resolves and renders blog page with route params', async () => {
    const site = await loadSite(starterDir, storage)
    const resolved = await resolvePage('blog/[slug]', site)
    const html = await renderPage(resolved, site.pages.get('blog/[slug]')!.metadata, { slug: 'hello-world' })

    expect(html).toContain('<title>Blog Post</title>')
    expect(html).toContain('Hello from Gazetta')
    expect(html).toContain('The Gazetta Team')
    expect(html).toContain('© 2026 Gazetta')
  })

  it('renders valid HTML document with scoped CSS', async () => {
    const site = await loadSite(starterDir, storage)
    const resolved = await resolvePage('home', site)
    const html = await renderPage(resolved, site.pages.get('home')!.metadata)

    expect(html).toMatch(/^<!DOCTYPE html>/)
    expect(html).toContain('<html lang="en">')
    expect(html).toContain('<meta charset="UTF-8">')
    expect(html).toContain('<style>')
    expect(html).toContain('</html>')
    expect(html).toContain('[data-gz=')
    expect(html).toContain('data-gz=')
  })
})
