import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { TemplateFunction } from '@gazetta/shared'
import { createFilesystemProvider } from '../src/providers/filesystem.js'
import { resolvePage } from '../src/resolver.js'
import { loadSite } from '../src/site-loader.js'

const testDir = join(tmpdir(), 'gazetta-resolver-test')
const storage = createFilesystemProvider()

async function writeSite(files: Record<string, string>) {
  await rm(testDir, { recursive: true, force: true })
  for (const [path, content] of Object.entries(files)) {
    const fullPath = join(testDir, path)
    await mkdir(join(fullPath, '..'), { recursive: true })
    await writeFile(fullPath, content)
  }
}

async function writeTemplate(name: string) {
  const dir = join(testDir, 'templates', name)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'index.ts'), `
import { z } from 'zod'
export const schema = z.object({ text: z.string().optional() })
export default ({ content, children }) => ({
  html: '<div>' + (content?.text ?? '') + (children ?? []).map(c => c.html).join('') + '</div>',
  css: '',
  js: '',
})
`)
}

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('resolvePage', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('resolves a simple page with local components', async () => {
    await writeSite({
      'site.yaml': 'name: "Test"',
      'pages/home/page.yaml': 'route: /\ntemplate: echo\ncomponents:\n  - hero',
      'pages/home/hero/component.yaml': 'template: echo\ncontent:\n  text: "Hello"',
    })
    await writeTemplate('echo')

    const site = await loadSite(testDir, storage)
    const resolved = await resolvePage('home', site)

    expect(resolved.children).toHaveLength(1)
    expect(resolved.children[0].content?.text).toBe('Hello')
  })

  it('resolves a page with fragment references', async () => {
    await writeSite({
      'site.yaml': 'name: "Test"',
      'fragments/header/fragment.yaml': 'template: echo\ncontent:\n  text: "Header"',
      'pages/home/page.yaml': 'route: /\ntemplate: echo\ncomponents:\n  - "@header"',
    })
    await writeTemplate('echo')

    const site = await loadSite(testDir, storage)
    const resolved = await resolvePage('home', site)

    expect(resolved.children).toHaveLength(1)
    expect(resolved.children[0].content?.text).toBe('Header')
  })

  it('resolves nested fragment with children', async () => {
    await writeSite({
      'site.yaml': 'name: "Test"',
      'fragments/header/fragment.yaml': 'template: echo\ncomponents:\n  - logo',
      'fragments/header/logo/component.yaml': 'template: echo\ncontent:\n  text: "Logo"',
      'pages/home/page.yaml': 'route: /\ntemplate: echo\ncomponents:\n  - "@header"',
    })
    await writeTemplate('echo')

    const site = await loadSite(testDir, storage)
    const resolved = await resolvePage('home', site)

    expect(resolved.children).toHaveLength(1)
    const header = resolved.children[0]
    expect(header.children).toHaveLength(1)
    expect(header.children[0].content?.text).toBe('Logo')
  })

  it('throws on missing page', async () => {
    await writeSite({ 'site.yaml': 'name: "Test"' })
    const site = await loadSite(testDir, storage)
    await expect(resolvePage('nope', site)).rejects.toThrow('Page "nope" not found')
  })

  it('throws on missing fragment', async () => {
    await writeSite({
      'site.yaml': 'name: "Test"',
      'pages/home/page.yaml': 'route: /\ntemplate: echo\ncomponents:\n  - "@missing"',
    })
    await writeTemplate('echo')

    const site = await loadSite(testDir, storage)
    await expect(resolvePage('home', site)).rejects.toThrow('Fragment "@missing" not found')
  })

  it('throws on missing local component', async () => {
    await writeSite({
      'site.yaml': 'name: "Test"',
      'pages/home/page.yaml': 'route: /\ntemplate: echo\ncomponents:\n  - nope',
    })
    await writeTemplate('echo')

    const site = await loadSite(testDir, storage)
    await expect(resolvePage('home', site)).rejects.toThrow('Component "nope" not found')
  })

  it('throws on missing template', async () => {
    await writeSite({
      'site.yaml': 'name: "Test"',
      'pages/home/page.yaml': 'route: /\ntemplate: nonexistent',
    })

    const site = await loadSite(testDir, storage)
    await expect(resolvePage('home', site)).rejects.toThrow('Template "nonexistent" not found')
  })

  it('lists available fragments on missing fragment error', async () => {
    await writeSite({
      'site.yaml': 'name: "Test"',
      'fragments/header/fragment.yaml': 'template: echo',
      'fragments/footer/fragment.yaml': 'template: echo',
      'pages/home/page.yaml': 'route: /\ntemplate: echo\ncomponents:\n  - "@missing"',
    })
    await writeTemplate('echo')

    const site = await loadSite(testDir, storage)
    try {
      await resolvePage('home', site)
      expect.fail('should have thrown')
    } catch (err) {
      const message = (err as Error).message
      expect(message).toContain('header')
      expect(message).toContain('footer')
    }
  })

  it('includes resolution path in error messages', async () => {
    await writeSite({
      'site.yaml': 'name: "Test"',
      'fragments/header/fragment.yaml': 'template: echo\ncomponents:\n  - missing-child',
      'pages/home/page.yaml': 'route: /\ntemplate: echo\ncomponents:\n  - "@header"',
    })
    await writeTemplate('echo')

    const site = await loadSite(testDir, storage)
    try {
      await resolvePage('home', site)
      expect.fail('should have thrown')
    } catch (err) {
      const message = (err as Error).message
      expect(message).toContain('@header')
    }
  })
})
