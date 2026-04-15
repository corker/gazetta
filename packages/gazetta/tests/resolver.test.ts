import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { createFilesystemProvider } from '../src/providers/filesystem.js'
import { resolveFragment, resolvePage } from '../src/resolver.js'
import { loadSite } from '../src/site-loader.js'
import { tempDir } from './_helpers/temp.js'

const testDir = tempDir('resolver-test')
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

  it('resolves a simple page with inline components', async () => {
    await writeSite({
      'site.yaml': 'name: "Test"',
      'pages/home/page.json': JSON.stringify({
        template: 'echo',
        components: [
          { name: 'hero', template: 'echo', content: { text: 'Hello' } },
        ],
      }),
    })
    await writeTemplate('echo')

    const site = await loadSite({ siteDir: testDir, storage })
    const resolved = await resolvePage('home', site)

    expect(resolved.children).toHaveLength(1)
    expect(resolved.children[0].content?.text).toBe('Hello')
  })

  it('resolves a page with fragment references', async () => {
    await writeSite({
      'site.yaml': 'name: "Test"',
      'fragments/header/fragment.json': JSON.stringify({ template: 'echo', content: { text: 'Header' } }),
      'pages/home/page.json': JSON.stringify({
        template: 'echo',
        components: ['@header'],
      }),
    })
    await writeTemplate('echo')

    const site = await loadSite({ siteDir: testDir, storage })
    const resolved = await resolvePage('home', site)

    expect(resolved.children).toHaveLength(1)
    expect(resolved.children[0].content?.text).toBe('Header')
  })

  it('resolves nested fragment with children', async () => {
    await writeSite({
      'site.yaml': 'name: "Test"',
      'fragments/header/fragment.json': JSON.stringify({
        template: 'echo',
        components: [
          { name: 'logo', template: 'echo', content: { text: 'Logo' } },
        ],
      }),
      'pages/home/page.json': JSON.stringify({
        template: 'echo',
        components: ['@header'],
      }),
    })
    await writeTemplate('echo')

    const site = await loadSite({ siteDir: testDir, storage })
    const resolved = await resolvePage('home', site)

    expect(resolved.children).toHaveLength(1)
    const header = resolved.children[0]
    expect(header.children).toHaveLength(1)
    expect(header.children[0].content?.text).toBe('Logo')
  })

  it('resolves deeply nested components', async () => {
    await writeSite({
      'site.yaml': 'name: "Test"',
      'pages/home/page.json': JSON.stringify({
        template: 'echo',
        components: [
          {
            name: 'features',
            template: 'echo',
            components: [
              { name: 'fast', template: 'echo', content: { text: 'Fast' } },
              { name: 'composable', template: 'echo', content: { text: 'Composable' } },
            ],
          },
        ],
      }),
    })
    await writeTemplate('echo')

    const site = await loadSite({ siteDir: testDir, storage })
    const resolved = await resolvePage('home', site)

    const features = resolved.children[0]
    expect(features.children).toHaveLength(2)
    expect(features.children[0].content?.text).toBe('Fast')
    expect(features.children[1].content?.text).toBe('Composable')
  })

  it('throws on missing page', async () => {
    await writeSite({ 'site.yaml': 'name: "Test"' })
    const site = await loadSite({ siteDir: testDir, storage })
    await expect(resolvePage('nope', site)).rejects.toThrow('Page "nope" not found')
  })

  it('throws on missing fragment', async () => {
    await writeSite({
      'site.yaml': 'name: "Test"',
      'pages/home/page.json': JSON.stringify({
        template: 'echo',
        components: ['@missing'],
      }),
    })
    await writeTemplate('echo')

    const site = await loadSite({ siteDir: testDir, storage })
    await expect(resolvePage('home', site)).rejects.toThrow('Fragment "@missing" not found')
  })

  it('throws on string entry that is not a fragment reference', async () => {
    await writeSite({
      'site.yaml': 'name: "Test"',
      'pages/home/page.json': JSON.stringify({
        template: 'echo',
        components: ['not-a-fragment'],
      }),
    })
    await writeTemplate('echo')

    const site = await loadSite({ siteDir: testDir, storage })
    await expect(resolvePage('home', site)).rejects.toThrow('string entries must be fragment references')
  })

  it('throws on missing template', async () => {
    await writeSite({
      'site.yaml': 'name: "Test"',
      'pages/home/page.json': JSON.stringify({ template: 'nonexistent' }),
    })

    const site = await loadSite({ siteDir: testDir, storage })
    await expect(resolvePage('home', site)).rejects.toThrow('Template "nonexistent" not found')
  })

  it('lists available fragments on missing fragment error', async () => {
    await writeSite({
      'site.yaml': 'name: "Test"',
      'fragments/header/fragment.json': JSON.stringify({ template: 'echo' }),
      'fragments/footer/fragment.json': JSON.stringify({ template: 'echo' }),
      'pages/home/page.json': JSON.stringify({
        template: 'echo',
        components: ['@missing'],
      }),
    })
    await writeTemplate('echo')

    const site = await loadSite({ siteDir: testDir, storage })
    try {
      await resolvePage('home', site)
      expect.fail('should have thrown')
    } catch (err) {
      const message = (err as Error).message
      expect(message).toContain('header')
      expect(message).toContain('footer')
    }
  })

  it('sets treePath on resolved components', async () => {
    await writeSite({
      'site.yaml': 'name: "Test"',
      'pages/home/page.json': JSON.stringify({
        template: 'echo',
        components: [
          {
            name: 'features',
            template: 'echo',
            components: [
              { name: 'fast', template: 'echo', content: { text: 'Fast' } },
            ],
          },
        ],
      }),
    })
    await writeTemplate('echo')

    const site = await loadSite({ siteDir: testDir, storage })
    const resolved = await resolvePage('home', site)

    expect(resolved.treePath).toBe('')
    expect(resolved.children[0].treePath).toBe('features')
    expect(resolved.children[0].children[0].treePath).toBe('features/fast')
  })
})

describe('resolveFragment', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('resolves a simple fragment', async () => {
    await writeSite({
      'site.yaml': 'name: "Test"',
      'fragments/header/fragment.json': JSON.stringify({ template: 'echo', content: { text: 'Header' } }),
    })
    await writeTemplate('echo')

    const site = await loadSite({ siteDir: testDir, storage })
    const resolved = await resolveFragment('header', site)

    expect(resolved.content?.text).toBe('Header')
    expect(resolved.treePath).toBe('')
  })

  it('resolves a fragment with inline children', async () => {
    await writeSite({
      'site.yaml': 'name: "Test"',
      'fragments/header/fragment.json': JSON.stringify({
        template: 'echo',
        components: [
          { name: 'logo', template: 'echo', content: { text: 'Logo' } },
        ],
      }),
    })
    await writeTemplate('echo')

    const site = await loadSite({ siteDir: testDir, storage })
    const resolved = await resolveFragment('header', site)

    expect(resolved.children).toHaveLength(1)
    expect(resolved.children[0].content?.text).toBe('Logo')
    expect(resolved.children[0].treePath).toBe('@header/logo')
  })

  it('throws on missing fragment', async () => {
    await writeSite({ 'site.yaml': 'name: "Test"' })
    const site = await loadSite({ siteDir: testDir, storage })
    await expect(resolveFragment('nope', site)).rejects.toThrow('Fragment "nope" not found')
  })

  it('lists available fragments on missing fragment error', async () => {
    await writeSite({
      'site.yaml': 'name: "Test"',
      'fragments/header/fragment.json': JSON.stringify({ template: 'echo' }),
      'fragments/footer/fragment.json': JSON.stringify({ template: 'echo' }),
    })
    await writeTemplate('echo')

    const site = await loadSite({ siteDir: testDir, storage })
    try {
      await resolveFragment('missing', site)
      expect.fail('should have thrown')
    } catch (err) {
      const message = (err as Error).message
      expect(message).toContain('header')
      expect(message).toContain('footer')
    }
  })
})
