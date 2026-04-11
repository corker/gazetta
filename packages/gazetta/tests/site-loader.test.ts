import { describe, it, expect, vi, afterEach } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { writeFile, mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { deriveRoute } from '../src/site-loader.js'
import { createFilesystemProvider } from '../src/providers/filesystem.js'
import { loadSite } from '../src/site-loader.js'

const testDir = join(tmpdir(), 'gazetta-siteloader-test-' + Date.now())
const storage = createFilesystemProvider()

async function writeTestFile(path: string, content: string) {
  const full = join(testDir, path)
  await mkdir(join(full, '..'), { recursive: true })
  await writeFile(full, content)
}

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

describe('loadSite', () => {
  it('throws when site.yaml is missing', async () => {
    await mkdir(testDir, { recursive: true })
    await expect(loadSite(testDir, storage)).rejects.toThrow('No site.yaml found')
  })

  it('loads a minimal site', async () => {
    await writeTestFile('site.yaml', 'name: Test Site')
    await mkdir(join(testDir, 'pages'), { recursive: true })
    await mkdir(join(testDir, 'fragments'), { recursive: true })

    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const site = await loadSite(testDir, storage)
    expect(site.manifest.name).toBe('Test Site')
    expect(site.pages.size).toBe(0)
    expect(site.fragments.size).toBe(0)
    spy.mockRestore()
  })

  it('discovers pages', async () => {
    await writeTestFile('site.yaml', 'name: Test')
    await writeTestFile('pages/home/page.yaml', 'route: /\ntemplate: default')
    await writeTestFile('pages/about/page.yaml', 'route: /about\ntemplate: default')
    await mkdir(join(testDir, 'fragments'), { recursive: true })

    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const site = await loadSite(testDir, storage)
    expect(site.pages.size).toBe(2)
    expect(site.pages.has('home')).toBe(true)
    expect(site.pages.has('about')).toBe(true)
    expect(site.pages.get('home')!.route).toBe('/')
    spy.mockRestore()
  })

  it('discovers nested pages', async () => {
    await writeTestFile('site.yaml', 'name: Test')
    await writeTestFile('pages/blog/[slug]/page.yaml', 'route: /blog/:slug\ntemplate: default')
    await mkdir(join(testDir, 'fragments'), { recursive: true })

    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const site = await loadSite(testDir, storage)
    expect(site.pages.has('blog/[slug]')).toBe(true)
    expect(site.pages.get('blog/[slug]')!.route).toBe('/blog/:slug')
    spy.mockRestore()
  })

  it('discovers fragments', async () => {
    await writeTestFile('site.yaml', 'name: Test')
    await mkdir(join(testDir, 'pages'), { recursive: true })
    await writeTestFile('fragments/header/fragment.yaml', 'template: header-layout')
    await writeTestFile('fragments/footer/fragment.yaml', 'template: footer-layout')

    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const site = await loadSite(testDir, storage)
    expect(site.fragments.size).toBe(2)
    expect(site.fragments.has('header')).toBe(true)
    expect(site.fragments.has('footer')).toBe(true)
    spy.mockRestore()
  })

  it('sets dir on pages and fragments', async () => {
    await writeTestFile('site.yaml', 'name: Test')
    await writeTestFile('pages/home/page.yaml', 'route: /\ntemplate: default')
    await writeTestFile('fragments/header/fragment.yaml', 'template: header-layout')

    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const site = await loadSite(testDir, storage)
    expect(site.pages.get('home')!.dir).toContain('pages/home')
    expect(site.fragments.get('header')!.dir).toContain('fragments/header')
    spy.mockRestore()
  })

  it('skips malformed page manifests', async () => {
    await writeTestFile('site.yaml', 'name: Test')
    await writeTestFile('pages/good/page.yaml', 'route: /\ntemplate: default')
    await writeTestFile('pages/bad/page.yaml', 'invalid: yaml: [[[')
    await mkdir(join(testDir, 'fragments'), { recursive: true })

    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const site = await loadSite(testDir, storage)
    expect(site.pages.size).toBe(1)
    expect(site.pages.has('good')).toBe(true)
    spy.mockRestore()
  })

  it('warns when no pages found', async () => {
    await writeTestFile('site.yaml', 'name: Test')
    await mkdir(join(testDir, 'pages'), { recursive: true })
    await mkdir(join(testDir, 'fragments'), { recursive: true })

    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await loadSite(testDir, storage)
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('no pages found'))
    spy.mockRestore()
  })

  it('loads the real starter site', async () => {
    const projectRoot = resolve(import.meta.dirname, '../../../examples/starter')
    const site = await loadSite({ siteDir: resolve(projectRoot, 'sites/main'), storage, templatesDir: resolve(projectRoot, 'templates') })
    expect(site.manifest.name).toBe('Gazetta Starter')
    expect(site.pages.size).toBeGreaterThanOrEqual(3)
    expect(site.fragments.size).toBe(2)
  })
})

describe('deriveRoute', () => {
  it('home → /', () => {
    expect(deriveRoute('home')).toBe('/')
  })

  it('about → /about', () => {
    expect(deriveRoute('about')).toBe('/about')
  })

  it('blog/[slug] → /blog/:slug', () => {
    expect(deriveRoute('blog/[slug]')).toBe('/blog/:slug')
  })

  it('docs/getting-started → /docs/getting-started', () => {
    expect(deriveRoute('docs/getting-started')).toBe('/docs/getting-started')
  })

  it('products/[category]/[id] → /products/:category/:id', () => {
    expect(deriveRoute('products/[category]/[id]')).toBe('/products/:category/:id')
  })
})
