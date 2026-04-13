import { describe, it, expect, afterEach } from 'vitest'
import { writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createFilesystemProvider } from '../src/providers/filesystem.js'
import {
  parseSiteManifest,
  parsePageManifest,
  parseFragmentManifest,
} from '../src/manifest.js'

const testDir = join(tmpdir(), 'gazetta-manifest-test')
const storage = createFilesystemProvider()

async function writeTestFile(filename: string, content: string): Promise<string> {
  const path = join(testDir, filename)
  await mkdir(testDir, { recursive: true })
  await writeFile(path, content)
  return path
}

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

describe('parseSiteManifest', () => {
  it('parses a valid site.yaml', async () => {
    const path = await writeTestFile('site.yaml', 'name: "My Site"\nversion: "1.0"')
    const result = await parseSiteManifest(storage, path)
    expect(result.name).toBe('My Site')
    expect(result.version).toBe('1.0')
  })

  it('parses site.yaml without version', async () => {
    const path = await writeTestFile('site.yaml', 'name: "My Site"')
    const result = await parseSiteManifest(storage, path)
    expect(result.name).toBe('My Site')
    expect(result.version).toBeUndefined()
  })

  it('throws on missing name', async () => {
    const path = await writeTestFile('site.yaml', 'version: "1.0"')
    await expect(parseSiteManifest(storage, path)).rejects.toThrow('missing required "name" field')
  })

  it('throws on file not found', async () => {
    await expect(parseSiteManifest(storage, '/nonexistent/site.yaml')).rejects.toThrow('File not found')
  })
})

describe('parsePageManifest', () => {
  it('parses a valid page.json', async () => {
    const path = await writeTestFile('page.json', JSON.stringify({
      template: 'page-default',
      content: { title: 'Home' },
      components: [
        '@header',
        { name: 'hero', template: 'hero', content: { title: 'Welcome' } },
        '@footer',
      ],
    }))
    const result = await parsePageManifest(storage, path)
    expect(result.template).toBe('page-default')
    expect(result.content?.title).toBe('Home')
    expect(result.components).toHaveLength(3)
    expect(result.components![0]).toBe('@header')
    expect(result.components![1]).toEqual({ name: 'hero', template: 'hero', content: { title: 'Welcome' } })
    expect(result.components![2]).toBe('@footer')
  })

  it('parses nested components', async () => {
    const path = await writeTestFile('page.json', JSON.stringify({
      template: 'page-default',
      components: [
        {
          name: 'features',
          template: 'features-grid',
          content: { heading: 'Why?' },
          components: [
            { name: 'fast', template: 'feature-card', content: { title: 'Fast' } },
            { name: 'composable', template: 'feature-card', content: { title: 'Composable' } },
          ],
        },
      ],
    }))
    const result = await parsePageManifest(storage, path)
    const features = result.components![0]
    expect(typeof features).toBe('object')
    if (typeof features === 'object') {
      expect(features.name).toBe('features')
      expect(features.components).toHaveLength(2)
      expect(features.components![0]).toEqual({ name: 'fast', template: 'feature-card', content: { title: 'Fast' } })
    }
  })

  it('throws on missing template', async () => {
    const path = await writeTestFile('page.json', JSON.stringify({ components: [] }))
    await expect(parsePageManifest(storage, path)).rejects.toThrow('missing required "template" field')
  })

  it('handles page without components', async () => {
    const path = await writeTestFile('page.json', JSON.stringify({ template: 'default' }))
    const result = await parsePageManifest(storage, path)
    expect(result.components).toBeUndefined()
  })

  it('throws on invalid JSON', async () => {
    const path = await writeTestFile('page.json', '{ bad json')
    await expect(parsePageManifest(storage, path)).rejects.toThrow('JSON parse error')
  })

  it('throws on empty file', async () => {
    const path = await writeTestFile('page.json', '')
    await expect(parsePageManifest(storage, path)).rejects.toThrow('JSON parse error')
  })
})

describe('parseFragmentManifest', () => {
  it('parses a valid fragment.json', async () => {
    const path = await writeTestFile('fragment.json', JSON.stringify({
      template: 'header-layout',
      components: [
        { name: 'logo', template: 'logo', content: { brand: 'Gazetta' } },
        { name: 'nav', template: 'nav', content: { links: [] } },
      ],
    }))
    const result = await parseFragmentManifest(storage, path)
    expect(result.template).toBe('header-layout')
    expect(result.components).toHaveLength(2)
  })

  it('parses fragment with fragment references', async () => {
    const path = await writeTestFile('fragment.json', JSON.stringify({
      template: 'header-layout',
      components: ['@logo', { name: 'nav', template: 'nav' }],
    }))
    const result = await parseFragmentManifest(storage, path)
    expect(result.components![0]).toBe('@logo')
  })

  it('throws on missing template', async () => {
    const path = await writeTestFile('fragment.json', JSON.stringify({ components: [] }))
    await expect(parseFragmentManifest(storage, path)).rejects.toThrow('missing required "template" field')
  })

  it('handles fragment with content', async () => {
    const path = await writeTestFile('fragment.json', JSON.stringify({
      template: 'hero',
      content: { title: 'Hello' },
    }))
    const result = await parseFragmentManifest(storage, path)
    expect(result.content?.title).toBe('Hello')
  })
})
