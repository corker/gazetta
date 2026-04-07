import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { writeFile, mkdir, rm, readdir } from 'node:fs/promises'
import { createFilesystemProvider } from '../src/providers/filesystem.js'
import { publishItems, resolveDependencies } from '../src/publish.js'
import { publishPageRendered, publishFragmentRendered } from '../src/publish-rendered.js'

const testDir = join(tmpdir(), 'gazetta-publish-test-' + Date.now())
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
    await writeTestFile(sourceDir, 'pages/home/page.yaml', 'route: /\ntemplate: default')
    await writeTestFile(sourceDir, 'pages/home/hero/component.yaml', 'template: hero')
    await writeTestFile(sourceDir, 'site.yaml', 'name: Test')

    const source = createFilesystemProvider(sourceDir)
    const target = createFilesystemProvider(targetDir)

    const { copiedFiles } = await publishItems(source, '', target, '', ['pages/home'])
    expect(copiedFiles).toBeGreaterThanOrEqual(3) // page.yaml + component.yaml + site.yaml
    expect(await target.exists('pages/home/page.yaml')).toBe(true)
    expect(await target.exists('pages/home/hero/component.yaml')).toBe(true)
    expect(await target.exists('site.yaml')).toBe(true)
  })

  it('copies multiple items', async () => {
    await writeTestFile(sourceDir, 'pages/home/page.yaml', 'route: /')
    await writeTestFile(sourceDir, 'fragments/header/fragment.yaml', 'template: header')
    await writeTestFile(sourceDir, 'site.yaml', 'name: Test')

    const source = createFilesystemProvider(sourceDir)
    const target = createFilesystemProvider(targetDir)

    const { copiedFiles } = await publishItems(source, '', target, '', ['pages/home', 'fragments/header'])
    expect(copiedFiles).toBeGreaterThanOrEqual(3)
    expect(await target.exists('pages/home/page.yaml')).toBe(true)
    expect(await target.exists('fragments/header/fragment.yaml')).toBe(true)
  })

  it('copies nested directory structure', async () => {
    await writeTestFile(sourceDir, 'pages/blog/[slug]/page.yaml', 'route: /blog/:slug')
    await writeTestFile(sourceDir, 'pages/blog/[slug]/article/component.yaml', 'template: article')
    await writeTestFile(sourceDir, 'site.yaml', 'name: Test')

    const source = createFilesystemProvider(sourceDir)
    const target = createFilesystemProvider(targetDir)

    const { copiedFiles } = await publishItems(source, '', target, '', ['pages/blog/[slug]'])
    expect(copiedFiles).toBeGreaterThanOrEqual(3)
    expect(await target.exists('pages/blog/[slug]/page.yaml')).toBe(true)
    expect(await target.exists('pages/blog/[slug]/article/component.yaml')).toBe(true)
  })

  it('preserves file content', async () => {
    const content = 'route: /\ntemplate: page-default\nmetadata:\n  title: Home'
    await writeTestFile(sourceDir, 'pages/home/page.yaml', content)
    await writeTestFile(sourceDir, 'site.yaml', 'name: Test')

    const source = createFilesystemProvider(sourceDir)
    const target = createFilesystemProvider(targetDir)

    await publishItems(source, '', target, '', ['pages/home'])
    const copied = await target.readFile('pages/home/page.yaml')
    expect(copied).toBe(content)
  })

  it('handles missing site.yaml gracefully', async () => {
    await writeTestFile(sourceDir, 'pages/home/page.yaml', 'route: /')

    const source = createFilesystemProvider(sourceDir)
    const target = createFilesystemProvider(targetDir)

    const { copiedFiles } = await publishItems(source, '', target, '', ['pages/home'])
    expect(copiedFiles).toBe(1) // only page.yaml, no site.yaml
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
    await writeTestFile(sourceDir, 'pages/home/page.yaml', 'route: /\ntemplate: default')

    const storage = createFilesystemProvider(sourceDir)
    const deps = await resolveDependencies(storage, '', ['pages/home'])
    expect(deps).toContain('pages/home')
  })

  it('resolves template dependency', async () => {
    await writeTestFile(sourceDir, 'pages/home/page.yaml', 'route: /\ntemplate: page-default')

    const storage = createFilesystemProvider(sourceDir)
    const deps = await resolveDependencies(storage, '', ['pages/home'])
    expect(deps).toContain('templates/page-default')
  })

  it('resolves fragment dependencies', async () => {
    await writeTestFile(sourceDir, 'pages/home/page.yaml', 'route: /\ntemplate: default\ncomponents:\n  - "@header"\n  - hero')

    const storage = createFilesystemProvider(sourceDir)
    const deps = await resolveDependencies(storage, '', ['pages/home'])
    expect(deps).toContain('fragments/header')
  })

  it('resolves nested fragment dependencies', async () => {
    await writeTestFile(sourceDir, 'pages/home/page.yaml', 'route: /\ntemplate: default\ncomponents:\n  - "@header"')
    await writeTestFile(sourceDir, 'fragments/header/fragment.yaml', 'template: header-layout\ncomponents:\n  - logo\n  - nav')
    await writeTestFile(sourceDir, 'fragments/header/logo/component.yaml', 'template: logo')
    await writeTestFile(sourceDir, 'fragments/header/nav/component.yaml', 'template: nav')

    const storage = createFilesystemProvider(sourceDir)
    const deps = await resolveDependencies(storage, '', ['pages/home'])
    expect(deps).toContain('fragments/header')
    expect(deps).toContain('templates/header-layout')
    expect(deps).toContain('templates/logo')
    expect(deps).toContain('templates/nav')
  })

  it('deduplicates dependencies', async () => {
    await writeTestFile(sourceDir, 'pages/home/page.yaml', 'route: /\ntemplate: default\ncomponents:\n  - "@header"\n  - "@footer"')
    await writeTestFile(sourceDir, 'pages/about/page.yaml', 'route: /about\ntemplate: default\ncomponents:\n  - "@header"\n  - "@footer"')

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
  const starterDir = resolve(import.meta.dirname, '../../../examples/starter')
  const storage = createFilesystemProvider()
  const renderTargetDir = join(tmpdir(), 'gazetta-render-test-' + Date.now())

  afterEach(async () => {
    await rm(renderTargetDir, { recursive: true, force: true })
  })

  it('publishes a page as HTML with ESI placeholders and hashed CSS', async () => {
    const target = createFilesystemProvider(renderTargetDir)
    const { files } = await publishPageRendered('home', storage, starterDir, target)
    expect(files).toBeGreaterThanOrEqual(2) // index.html + styles.{hash}.css

    // Check page HTML exists with ESI tags
    const html = await target.readFile('pages/home/index.html')
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<!--esi:/fragments/header/index.html-->')
    expect(html).toContain('Welcome to Gazetta')

    // Check hashed CSS exists
    const entries = await target.readDir('pages/home')
    const cssFiles = entries.filter(e => e.name.endsWith('.css'))
    expect(cssFiles.length).toBe(1)
    expect(cssFiles[0].name).toMatch(/^styles\.[a-f0-9]{8}\.css$/)
  })

  it('publishes a fragment as HTML with hashed CSS', async () => {
    const target = createFilesystemProvider(renderTargetDir)
    const { files } = await publishFragmentRendered('header', storage, starterDir, target)
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
    await publishFragmentRendered('header', storage, starterDir, target)
    const entries1 = await target.readDir('fragments/header')
    const css1 = entries1.find(e => e.name.endsWith('.css'))!.name

    // Write a fake old hashed CSS file
    await target.writeFile(`fragments/header/styles.00000000.css`, '.old {}')
    const entriesBefore = await target.readDir('fragments/header')
    expect(entriesBefore.filter(e => e.name.endsWith('.css')).length).toBe(2)

    // Publish again — same content, same hash
    await publishFragmentRendered('header', storage, starterDir, target)
    const entriesAfter = await target.readDir('fragments/header')
    const cssAfter = entriesAfter.filter(e => e.name.endsWith('.css'))

    // Old fake file should be cleaned up, real file kept
    expect(cssAfter.length).toBe(1)
    expect(cssAfter[0].name).toBe(css1)
  })

  it('page publish cleans up old hashed JS files', async () => {
    const target = createFilesystemProvider(renderTargetDir)

    // First publish
    await publishPageRendered('home', storage, starterDir, target)

    // Write fake old files
    await target.writeFile('pages/home/styles.00000000.css', '.old {}')
    await target.writeFile('pages/home/script.00000000.js', '// old')

    // Publish again
    await publishPageRendered('home', storage, starterDir, target)
    const entries = await target.readDir('pages/home')
    const oldCss = entries.filter(e => e.name === 'styles.00000000.css')
    const oldJs = entries.filter(e => e.name === 'script.00000000.js')
    expect(oldCss.length).toBe(0)
    expect(oldJs.length).toBe(0)
  })

  it('bakes cache config comment into page HTML with defaults', async () => {
    const target = createFilesystemProvider(renderTargetDir)
    await publishPageRendered('home', storage, starterDir, target)
    const html = await target.readFile('pages/home/index.html')
    expect(html).toMatch(/^<!--cache:browser=0,edge=86400-->/)
    expect(html).toContain('<!DOCTYPE html>')
  })

  it('bakes target cache config into page HTML', async () => {
    const target = createFilesystemProvider(renderTargetDir)
    await publishPageRendered('home', storage, starterDir, target, { browser: 120, edge: 3600 })
    const html = await target.readFile('pages/home/index.html')
    expect(html).toMatch(/^<!--cache:browser=120,edge=3600-->/)
  })

  it('cache comment is on first line before DOCTYPE', async () => {
    const target = createFilesystemProvider(renderTargetDir)
    await publishPageRendered('home', storage, starterDir, target)
    const html = await target.readFile('pages/home/index.html')
    const lines = html.split('\n')
    expect(lines[0]).toMatch(/^<!--cache:/)
    expect(lines[1]).toBe('<!DOCTYPE html>')
  })
})
