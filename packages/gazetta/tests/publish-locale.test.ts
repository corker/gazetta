import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { rm } from 'node:fs/promises'
import { createFilesystemProvider } from '../src/providers/filesystem.js'
import { createContentRoot } from '../src/content-root.js'
import { publishPageRendered, publishFragmentRendered, publishPageStatic } from '../src/publish-rendered.js'
import { publishPageAllLocales, publishFragmentAllLocales } from '../src/publish-locale.js'
import { loadSite, type Site } from '../src/site-loader.js'
import { tempDir } from './_helpers/temp.js'
import { starterManifest, starterTargetDir, starterTemplatesDir } from './_helpers/starter.js'

const storage = createFilesystemProvider()
const renderTargetDir = tempDir('publish-locale-test-' + Date.now())
let site: Site

beforeAll(async () => {
  const manifest = await starterManifest()
  site = await loadSite({ siteDir: starterTargetDir, storage, templatesDir: starterTemplatesDir, manifest })
})

afterEach(async () => {
  await rm(renderTargetDir, { recursive: true, force: true })
})

describe('publishPageRendered with locale', () => {
  it('writes locale-suffixed file for ESI page', async () => {
    const target = createFilesystemProvider(renderTargetDir)
    await publishPageRendered(
      'home',
      createContentRoot(storage, starterTargetDir),
      target,
      undefined,
      starterTemplatesDir,
      undefined,
      site,
      { siteName: 'Test', locale: 'fr' },
      'fr',
    )

    // Locale file should exist
    const entries = await target.readDir('pages/home')
    const htmlFiles = entries.filter(e => e.name.endsWith('.html'))
    expect(htmlFiles.some(f => f.name === 'index.fr.html')).toBe(true)

    const html = await target.readFile('pages/home/index.fr.html')
    expect(html).toContain('<html lang="fr">')
    expect(html).toContain('<!DOCTYPE html>')
  })

  it('default locale writes to index.html', async () => {
    const target = createFilesystemProvider(renderTargetDir)
    await publishPageRendered(
      'home',
      createContentRoot(storage, starterTargetDir),
      target,
      undefined,
      starterTemplatesDir,
      undefined,
      site,
    )
    const entries = await target.readDir('pages/home')
    expect(entries.some(e => e.name === 'index.html')).toBe(true)
  })

  it('locale and default do not overwrite each other', async () => {
    const target = createFilesystemProvider(renderTargetDir)
    const root = createContentRoot(storage, starterTargetDir)

    // Publish default (en)
    await publishPageRendered('home', root, target, undefined, starterTemplatesDir, undefined, site, {
      siteName: 'Test',
      locale: 'en',
    })
    // Publish French
    await publishPageRendered(
      'home',
      root,
      target,
      undefined,
      starterTemplatesDir,
      undefined,
      site,
      { siteName: 'Test', locale: 'fr' },
      'fr',
    )

    const entries = await target.readDir('pages/home')
    const htmlFiles = entries.filter(e => e.name.endsWith('.html')).map(e => e.name)
    expect(htmlFiles).toContain('index.html')
    expect(htmlFiles).toContain('index.fr.html')

    const defaultHtml = await target.readFile('pages/home/index.html')
    const frHtml = await target.readFile('pages/home/index.fr.html')
    expect(defaultHtml).toContain('<html lang="en">')
    expect(frHtml).toContain('<html lang="fr">')
  })

  it('ESI fragment references include locale suffix', async () => {
    const target = createFilesystemProvider(renderTargetDir)
    await publishPageRendered(
      'home',
      createContentRoot(storage, starterTargetDir),
      target,
      undefined,
      starterTemplatesDir,
      undefined,
      site,
      undefined,
      'fr',
    )
    const html = await target.readFile('pages/home/index.fr.html')
    expect(html).toContain('index.fr.html')
    expect(html).toContain('<!--esi:')
  })
})

describe('publishFragmentRendered with locale', () => {
  it('writes locale-suffixed file', async () => {
    const target = createFilesystemProvider(renderTargetDir)
    await publishFragmentRendered(
      'header',
      createContentRoot(storage, starterTargetDir),
      target,
      starterTemplatesDir,
      undefined,
      site,
      'fr',
    )
    const entries = await target.readDir('fragments/header')
    expect(entries.some(e => e.name === 'index.fr.html')).toBe(true)
  })

  it('default and locale fragments coexist', async () => {
    const target = createFilesystemProvider(renderTargetDir)
    const root = createContentRoot(storage, starterTargetDir)

    await publishFragmentRendered('header', root, target, starterTemplatesDir, undefined, site)
    await publishFragmentRendered('header', root, target, starterTemplatesDir, undefined, site, 'fr')

    const entries = await target.readDir('fragments/header')
    const htmlFiles = entries.filter(e => e.name.endsWith('.html')).map(e => e.name)
    expect(htmlFiles).toContain('index.html')
    expect(htmlFiles).toContain('index.fr.html')
  })
})

describe('publishPageRendered sidecar per locale', () => {
  it('default locale publish writes sidecars', async () => {
    const target = createFilesystemProvider(renderTargetDir)
    const root = createContentRoot(storage, starterTargetDir)
    const { hashManifest } = await import('../src/hash.js')

    const page = site.pages.get('home')!
    const enHash = hashManifest(page, { templateHashes: new Map() })

    // Publish default (no locale param) with hash
    await publishPageRendered('home', root, target, undefined, starterTemplatesDir, enHash, site, {
      siteName: 'Test',
      locale: 'en',
    })

    const entries = await target.readDir('pages/home')
    const hashFiles = entries.filter(e => e.name.endsWith('.hash'))
    expect(hashFiles.length).toBe(1)

    const pubFiles = entries.filter(e => e.name.startsWith('.pub-'))
    expect(pubFiles.length).toBe(1)
  })

  it('locale variant publish does not overwrite default sidecars', async () => {
    const target = createFilesystemProvider(renderTargetDir)
    const root = createContentRoot(storage, starterTargetDir)
    const { hashManifest } = await import('../src/hash.js')

    const page = site.pages.get('home')!
    const hash = hashManifest(page, { templateHashes: new Map() })

    // Publish default first
    await publishPageRendered('home', root, target, undefined, starterTemplatesDir, hash, site, {
      siteName: 'Test',
      locale: 'en',
    })

    // Record the sidecar state after default publish
    const entriesBefore = await target.readDir('pages/home')
    const hashBefore = entriesBefore.find(e => e.name.endsWith('.hash'))!.name

    // Publish FR — should NOT write sidecars (locale variant)
    await publishPageRendered(
      'home',
      root,
      target,
      undefined,
      starterTemplatesDir,
      hash,
      site,
      { siteName: 'Test', locale: 'fr' },
      'fr',
    )

    // Both HTML files coexist
    const entries = await target.readDir('pages/home')
    const htmlFiles = entries.filter(e => e.name.endsWith('.html')).map(e => e.name)
    expect(htmlFiles).toContain('index.html')
    expect(htmlFiles).toContain('index.fr.html')

    // Default sidecar unchanged — FR publish didn't touch it
    const hashAfter = entries.find(e => e.name.endsWith('.hash'))!.name
    expect(hashAfter).toBe(hashBefore)
  })

  it('locale-only publish creates HTML but no sidecars', async () => {
    const target = createFilesystemProvider(renderTargetDir)
    const root = createContentRoot(storage, starterTargetDir)
    const { hashManifest } = await import('../src/hash.js')

    const page = site.pages.get('home')!
    const hash = hashManifest(page, { templateHashes: new Map() })

    // Publish ONLY FR (no default first)
    await publishPageRendered(
      'home',
      root,
      target,
      undefined,
      starterTemplatesDir,
      hash,
      site,
      { siteName: 'Test', locale: 'fr' },
      'fr',
    )

    const entries = await target.readDir('pages/home')
    expect(entries.some(e => e.name === 'index.fr.html')).toBe(true)
    // No sidecars written for locale-only publish
    expect(entries.filter(e => e.name.endsWith('.hash')).length).toBe(0)
    expect(entries.filter(e => e.name.startsWith('.pub-')).length).toBe(0)
  })
})

describe('publishPageStatic with locale', () => {
  it('writes to locale-prefixed URL path', async () => {
    const target = createFilesystemProvider(renderTargetDir)
    await publishPageStatic(
      'about',
      createContentRoot(storage, starterTargetDir),
      target,
      starterTemplatesDir,
      undefined,
      site,
      undefined,
      'fr',
    )

    const html = await target.readFile('fr/about/index.html')
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('About') // content from default since no fr file in starter
  })

  it('default and locale static pages coexist', async () => {
    const target = createFilesystemProvider(renderTargetDir)
    const root = createContentRoot(storage, starterTargetDir)

    await publishPageStatic('about', root, target, starterTemplatesDir, undefined, site)
    await publishPageStatic('about', root, target, starterTemplatesDir, undefined, site, undefined, 'fr')

    const defaultHtml = await target.readFile('about/index.html')
    const frHtml = await target.readFile('fr/about/index.html')
    expect(defaultHtml).toContain('<!DOCTYPE html>')
    expect(frHtml).toContain('<!DOCTYPE html>')
  })

  it('home locale page writes to locale root', async () => {
    const target = createFilesystemProvider(renderTargetDir)
    await publishPageStatic(
      'home',
      createContentRoot(storage, starterTargetDir),
      target,
      starterTemplatesDir,
      undefined,
      site,
      undefined,
      'fr',
    )

    const html = await target.readFile('fr/index.html')
    expect(html).toContain('<!DOCTYPE html>')
  })
})
