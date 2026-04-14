import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join, resolve } from 'node:path'
import { writeFile, mkdir, rm, readdir } from 'node:fs/promises'
import { createFilesystemProvider } from '../src/providers/filesystem.js'
import { publishItems, resolveDependencies } from '../src/publish.js'
import { publishPageRendered, publishPageStatic, publishFragmentRendered } from '../src/publish-rendered.js'
import { tempDir } from './_helpers/temp.js'

const testDir = tempDir('publish-test-' + Date.now())
const sourceDir = join(testDir, 'source')
const targetDir = join(testDir, 'target')

async function writeTestFile(base: string, path: string, content: string) {
  const full = join(base, path)
  await mkdir(join(full, '..'), { recursive: true })
  await writeFile(full, content)
}

beforeEach(async () => {
  await mkdir(sourceDir, { recursive: true })
  await mkdir(targetDir, { recursive: true })
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

describe('publishItems', () => {
  it('copies a single page directory', async () => {
    await writeTestFile(sourceDir, 'pages/home/page.json', JSON.stringify({ template: 'default' }))
    await writeTestFile(sourceDir, 'site.yaml', 'name: Test')

    const source = createFilesystemProvider(sourceDir)
    const target = createFilesystemProvider(targetDir)

    const { copiedFiles } = await publishItems(source, '', target, '', ['pages/home'])
    expect(copiedFiles).toBeGreaterThanOrEqual(2) // page.json + site.yaml
    expect(await target.exists('pages/home/page.json')).toBe(true)
    expect(await target.exists('site.yaml')).toBe(true)
  })

  it('copies multiple items', async () => {
    await writeTestFile(sourceDir, 'pages/home/page.json', JSON.stringify({ template: 'default' }))
    await writeTestFile(sourceDir, 'fragments/header/fragment.json', JSON.stringify({ template: 'header' }))
    await writeTestFile(sourceDir, 'site.yaml', 'name: Test')

    const source = createFilesystemProvider(sourceDir)
    const target = createFilesystemProvider(targetDir)

    const { copiedFiles } = await publishItems(source, '', target, '', ['pages/home', 'fragments/header'])
    expect(copiedFiles).toBeGreaterThanOrEqual(3)
    expect(await target.exists('pages/home/page.json')).toBe(true)
    expect(await target.exists('fragments/header/fragment.json')).toBe(true)
  })

  it('copies nested directory structure', async () => {
    await writeTestFile(sourceDir, 'pages/blog/[slug]/page.json', JSON.stringify({ template: 'article' }))
    await writeTestFile(sourceDir, 'site.yaml', 'name: Test')

    const source = createFilesystemProvider(sourceDir)
    const target = createFilesystemProvider(targetDir)

    const { copiedFiles } = await publishItems(source, '', target, '', ['pages/blog/[slug]'])
    expect(copiedFiles).toBeGreaterThanOrEqual(2)
    expect(await target.exists('pages/blog/[slug]/page.json')).toBe(true)
  })

  it('preserves file content', async () => {
    const content = JSON.stringify({ template: 'page-default', content: { title: 'Home' } })
    await writeTestFile(sourceDir, 'pages/home/page.json', content)
    await writeTestFile(sourceDir, 'site.yaml', 'name: Test')

    const source = createFilesystemProvider(sourceDir)
    const target = createFilesystemProvider(targetDir)

    await publishItems(source, '', target, '', ['pages/home'])
    const copied = await target.readFile('pages/home/page.json')
    expect(copied).toBe(content)
  })

  it('handles missing site.yaml gracefully', async () => {
    await writeTestFile(sourceDir, 'pages/home/page.json', JSON.stringify({ template: 'default' }))

    const source = createFilesystemProvider(sourceDir)
    const target = createFilesystemProvider(targetDir)

    const { copiedFiles } = await publishItems(source, '', target, '', ['pages/home'])
    expect(copiedFiles).toBe(1) // only page.json, no site.yaml
  })

  it('returns 0 for nonexistent items', async () => {
    await writeTestFile(sourceDir, 'site.yaml', 'name: Test')

    const source = createFilesystemProvider(sourceDir)
    const target = createFilesystemProvider(targetDir)

    const { copiedFiles } = await publishItems(source, '', target, '', ['pages/nonexistent'])
    expect(copiedFiles).toBe(1) // only site.yaml
  })
})

describe('resolveDependencies', () => {
  it('includes the item itself', async () => {
    await writeTestFile(sourceDir, 'pages/home/page.json', JSON.stringify({ template: 'default' }))

    const storage = createFilesystemProvider(sourceDir)
    const deps = await resolveDependencies(storage, '', ['pages/home'])
    expect(deps).toContain('pages/home')
  })

  it('resolves template dependency', async () => {
    await writeTestFile(sourceDir, 'pages/home/page.json', JSON.stringify({ template: 'page-default' }))

    const storage = createFilesystemProvider(sourceDir)
    const deps = await resolveDependencies(storage, '', ['pages/home'])
    expect(deps).toContain('templates/page-default')
  })

  it('resolves fragment dependencies', async () => {
    await writeTestFile(sourceDir, 'pages/home/page.json', JSON.stringify({
      template: 'default',
      components: ['@header', { name: 'hero', template: 'hero' }],
    }))

    const storage = createFilesystemProvider(sourceDir)
    const deps = await resolveDependencies(storage, '', ['pages/home'])
    expect(deps).toContain('fragments/header')
    expect(deps).toContain('templates/hero')
  })

  it('resolves nested fragment dependencies', async () => {
    await writeTestFile(sourceDir, 'pages/home/page.json', JSON.stringify({
      template: 'default',
      components: ['@header'],
    }))
    await writeTestFile(sourceDir, 'fragments/header/fragment.json', JSON.stringify({
      template: 'header-layout',
      components: [
        { name: 'logo', template: 'logo' },
        { name: 'nav', template: 'nav' },
      ],
    }))

    const storage = createFilesystemProvider(sourceDir)
    const deps = await resolveDependencies(storage, '', ['pages/home'])
    expect(deps).toContain('fragments/header')
    expect(deps).toContain('templates/header-layout')
    expect(deps).toContain('templates/logo')
    expect(deps).toContain('templates/nav')
  })

  it('deduplicates dependencies', async () => {
    await writeTestFile(sourceDir, 'pages/home/page.json', JSON.stringify({ template: 'default', components: ['@header', '@footer'] }))
    await writeTestFile(sourceDir, 'pages/about/page.json', JSON.stringify({ template: 'default', components: ['@header', '@footer'] }))

    const storage = createFilesystemProvider(sourceDir)
    const deps = await resolveDependencies(storage, '', ['pages/home', 'pages/about'])
    const templateCount = deps.filter(d => d === 'templates/default').length
    expect(templateCount).toBe(1) // not duplicated
  })

  it('handles items without manifests', async () => {
    await mkdir(join(sourceDir, 'pages/empty'), { recursive: true })

    const storage = createFilesystemProvider(sourceDir)
    const deps = await resolveDependencies(storage, '', ['pages/empty'])
    expect(deps).toContain('pages/empty')
    expect(deps).toHaveLength(1)
  })
})

describe('publishRendered', () => {
  const projectRoot = resolve(import.meta.dirname, '../../../examples/starter')
  const starterDir = resolve(projectRoot, 'sites/main')
  const templatesDir = resolve(projectRoot, 'templates')
  const storage = createFilesystemProvider()
  const renderTargetDir = tempDir('render-test-' + Date.now())

  afterEach(async () => {
    await rm(renderTargetDir, { recursive: true, force: true })
  })

  it('publishes a page as HTML with ESI placeholders and hashed CSS', async () => {
    const target = createFilesystemProvider(renderTargetDir)
    const { files } = await publishPageRendered('home', storage, starterDir, target, undefined, templatesDir)
    expect(files).toBeGreaterThanOrEqual(2) // index.html + styles.{hash}.css

    // Check page HTML exists with ESI tags and title from content
    const html = await target.readFile('pages/home/index.html')
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<!--esi:/fragments/header/index.html-->')
    expect(html).toContain('Welcome to Gazetta')
    expect(html).toContain('<title>Home</title>')

    // Check hashed CSS exists
    const entries = await target.readDir('pages/home')
    const cssFiles = entries.filter(e => e.name.endsWith('.css'))
    expect(cssFiles.length).toBe(1)
    expect(cssFiles[0].name).toMatch(/^styles\.[a-f0-9]{8}\.css$/)
  })

  it('publishes a fragment as HTML with hashed CSS', async () => {
    const target = createFilesystemProvider(renderTargetDir)
    const { files } = await publishFragmentRendered('header', storage, starterDir, target, templatesDir)
    expect(files).toBeGreaterThanOrEqual(2) // index.html + styles.{hash}.css

    const html = await target.readFile('fragments/header/index.html')
    expect(html).toContain('<head>')
    expect(html).toContain('stylesheet')
    expect(html).toContain('Gazetta')

    const entries = await target.readDir('fragments/header')
    const cssFiles = entries.filter(e => e.name.endsWith('.css'))
    expect(cssFiles.length).toBe(1)
  })

  it('cleans up old hashed files when content changes', async () => {
    const target = createFilesystemProvider(renderTargetDir)

    // First publish
    await publishFragmentRendered('header', storage, starterDir, target, templatesDir)
    const entries1 = await target.readDir('fragments/header')
    const css1 = entries1.find(e => e.name.endsWith('.css'))!.name

    // Write a fake old hashed CSS file
    await target.writeFile(`fragments/header/styles.00000000.css`, '.old {}')
    const entriesBefore = await target.readDir('fragments/header')
    expect(entriesBefore.filter(e => e.name.endsWith('.css')).length).toBe(2)

    // Publish again — same content, same hash
    await publishFragmentRendered('header', storage, starterDir, target, templatesDir)
    const entriesAfter = await target.readDir('fragments/header')
    const cssAfter = entriesAfter.filter(e => e.name.endsWith('.css'))

    // Old fake file should be cleaned up, real file kept
    expect(cssAfter.length).toBe(1)
    expect(cssAfter[0].name).toBe(css1)
  })

  it('page publish cleans up old hashed JS files', async () => {
    const target = createFilesystemProvider(renderTargetDir)

    // First publish
    await publishPageRendered('home', storage, starterDir, target, undefined, templatesDir)

    // Write fake old files
    await target.writeFile('pages/home/styles.00000000.css', '.old {}')
    await target.writeFile('pages/home/script.00000000.js', '// old')

    // Publish again
    await publishPageRendered('home', storage, starterDir, target, undefined, templatesDir)
    const entries = await target.readDir('pages/home')
    const oldCss = entries.filter(e => e.name === 'styles.00000000.css')
    const oldJs = entries.filter(e => e.name === 'script.00000000.js')
    expect(oldCss.length).toBe(0)
    expect(oldJs.length).toBe(0)
  })

  it('bakes cache config comment into page HTML with defaults', async () => {
    const target = createFilesystemProvider(renderTargetDir)
    await publishPageRendered('home', storage, starterDir, target, undefined, templatesDir)
    const html = await target.readFile('pages/home/index.html')
    expect(html).toMatch(/^<!--cache:browser=0,edge=86400-->/)
    expect(html).toContain('<!DOCTYPE html>')
  })

  it('bakes target cache config into page HTML', async () => {
    const target = createFilesystemProvider(renderTargetDir)
    await publishPageRendered('home', storage, starterDir, target, { browser: 120, edge: 3600 }, templatesDir)
    const html = await target.readFile('pages/home/index.html')
    expect(html).toMatch(/^<!--cache:browser=120,edge=3600-->/)
  })

  it('cache comment is on first line before DOCTYPE', async () => {
    const target = createFilesystemProvider(renderTargetDir)
    await publishPageRendered('home', storage, starterDir, target, undefined, templatesDir)
    const html = await target.readFile('pages/home/index.html')
    const lines = html.split('\n')
    expect(lines[0]).toMatch(/^<!--cache:/)
    expect(lines[1]).toBe('<!DOCTYPE html>')
  })
})

describe('publishPageStatic', () => {
  const projectRoot2 = resolve(import.meta.dirname, '../../../examples/starter')
  const starterDir = resolve(projectRoot2, 'sites/main')
  const templatesDir = resolve(projectRoot2, 'templates')
  const storage = createFilesystemProvider()
  const staticTargetDir = tempDir('static-test-' + Date.now())

  afterEach(async () => {
    await rm(staticTargetDir, { recursive: true, force: true })
  })

  it('publishes fully assembled HTML at URL path', async () => {
    const target = createFilesystemProvider(staticTargetDir)
    await publishPageStatic('home', storage, starterDir, target, templatesDir)
    const html = await target.readFile('index.html')
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('Welcome to Gazetta')
    expect(html).toContain('<title>Home</title>') // from page content
    // Fragments baked in
    expect(html).toContain('Gazetta') // from header
    expect(html).toContain('© 2026') // from footer
    // No ESI tags
    expect(html).not.toContain('<!--esi')
  })

  it('publishes about page at /about/index.html', async () => {
    const target = createFilesystemProvider(staticTargetDir)
    await publishPageStatic('about', storage, starterDir, target, templatesDir)
    const html = await target.readFile('about/index.html')
    expect(html).toContain('About Gazetta')
    expect(html).not.toContain('<!--esi')
  })

  it('includes inline CSS and JS', async () => {
    const target = createFilesystemProvider(staticTargetDir)
    await publishPageStatic('home', storage, starterDir, target, templatesDir)
    const html = await target.readFile('index.html')
    expect(html).toContain('<style>')
    // Counter JS should be inline
    expect(html).toContain('script type="module"')
  })

  it('no separate CSS/JS files', async () => {
    const target = createFilesystemProvider(staticTargetDir)
    await publishPageStatic('home', storage, starterDir, target, templatesDir)
    const entries = await target.readDir('.')
    const cssOrJs = entries.filter(e => e.name.endsWith('.css') || e.name.endsWith('.js'))
    expect(cssOrJs.length).toBe(0)
  })
})

describe('getPublishMode', () => {
  // Import dynamically to avoid circular deps
  it('returns esi when worker configured', async () => {
    const { getPublishMode } = await import('../src/types.js')
    expect(getPublishMode({ storage: { type: 'r2' }, worker: { type: 'cloudflare' } })).toBe('esi')
  })

  it('returns static when no worker', async () => {
    const { getPublishMode } = await import('../src/types.js')
    expect(getPublishMode({ storage: { type: 'filesystem', path: './dist' } })).toBe('static')
  })

  it('respects explicit publishMode over worker config', async () => {
    const { getPublishMode } = await import('../src/types.js')
    // ESI without worker (for gazetta serve)
    expect(getPublishMode({ storage: { type: 's3' }, publishMode: 'esi' })).toBe('esi')
    // Static even with worker (override)
    expect(getPublishMode({ storage: { type: 'r2' }, worker: { type: 'cloudflare' }, publishMode: 'static' })).toBe('static')
  })
})

describe('findDependentsFromSidecars', () => {
  it('returns pages that reference a fragment via .uses-* sidecars', async () => {
    const { findDependentsFromSidecars } = await import('../src/publish.js')
    const target = createFilesystemProvider(targetDir)
    await writeTestFile(targetDir, 'pages/home/.cf120e4b.hash', '')
    await writeTestFile(targetDir, 'pages/home/.uses-header', '')
    await writeTestFile(targetDir, 'pages/home/.uses-footer', '')
    await writeTestFile(targetDir, 'pages/home/.tpl-page-default', '')
    await writeTestFile(targetDir, 'pages/about/.abc12345.hash', '')
    await writeTestFile(targetDir, 'pages/about/.uses-header', '')
    await writeTestFile(targetDir, 'pages/about/.tpl-page-default', '')
    await writeTestFile(targetDir, 'pages/blog/[slug]/.def67890.hash', '')
    await writeTestFile(targetDir, 'pages/blog/[slug]/.uses-header', '')
    await writeTestFile(targetDir, 'pages/blog/[slug]/.tpl-page-blog', '')

    const r = await findDependentsFromSidecars(target, { fragment: 'header' })
    expect(r.pages.sort()).toEqual(['about', 'blog/[slug]', 'home'])
    expect(r.fragments).toEqual([])
  })

  it('walks transitive fragment→fragment references', async () => {
    const { findDependentsFromSidecars } = await import('../src/publish.js')
    const target = createFilesystemProvider(targetDir)
    await writeTestFile(targetDir, 'fragments/header/.12345678.hash', '')
    await writeTestFile(targetDir, 'fragments/header/.uses-inner-logo', '')
    await writeTestFile(targetDir, 'pages/home/.87654321.hash', '')
    await writeTestFile(targetDir, 'pages/home/.uses-header', '')

    const r = await findDependentsFromSidecars(target, { fragment: 'inner-logo' })
    expect(r.pages).toEqual(['home'])
    expect(r.fragments).toEqual(['header'])
  })

  it('returns items that use a given template', async () => {
    const { findDependentsFromSidecars } = await import('../src/publish.js')
    const target = createFilesystemProvider(targetDir)
    // Real published state always has .hash alongside .uses-* / .tpl-*
    await writeTestFile(targetDir, 'pages/home/.11111111.hash', '')
    await writeTestFile(targetDir, 'pages/home/.uses-header', '')
    await writeTestFile(targetDir, 'pages/home/.tpl-page-default', '')
    await writeTestFile(targetDir, 'pages/blog/.22222222.hash', '')
    await writeTestFile(targetDir, 'pages/blog/.tpl-page-blog', '')
    await writeTestFile(targetDir, 'fragments/header/.33333333.hash', '')
    await writeTestFile(targetDir, 'fragments/header/.tpl-header-layout', '')

    const r = await findDependentsFromSidecars(target, { template: 'page-default' })
    expect(r.pages).toEqual(['home'])
    expect(r.fragments).toEqual([])
  })

  it('returns empty sets when target has no sidecars', async () => {
    const { findDependentsFromSidecars } = await import('../src/publish.js')
    const target = createFilesystemProvider(targetDir)
    const r = await findDependentsFromSidecars(target, { fragment: 'header' })
    expect(r.pages).toEqual([])
    expect(r.fragments).toEqual([])
  })
})
