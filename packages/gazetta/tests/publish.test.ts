import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { writeFile, mkdir, rm } from 'node:fs/promises'
import { createFilesystemProvider } from '../src/providers/filesystem.js'
import { publishItems, resolveDependencies } from '../src/publish.js'

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
