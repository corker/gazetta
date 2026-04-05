import { describe, it, expect, afterEach } from 'vitest'
import { writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  parseSiteManifest,
  parsePageManifest,
  parseFragmentManifest,
  parseComponentManifest,
} from '../src/manifest.js'

const testDir = join(tmpdir(), 'gazetta-manifest-test')

async function writeYaml(filename: string, content: string): Promise<string> {
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
    const path = await writeYaml('site.yaml', 'name: "My Site"\nversion: "1.0"')
    const result = await parseSiteManifest(path)
    expect(result.name).toBe('My Site')
    expect(result.version).toBe('1.0')
  })

  it('parses site.yaml without version', async () => {
    const path = await writeYaml('site.yaml', 'name: "My Site"')
    const result = await parseSiteManifest(path)
    expect(result.name).toBe('My Site')
    expect(result.version).toBeUndefined()
  })

  it('throws on missing name', async () => {
    const path = await writeYaml('site.yaml', 'version: "1.0"')
    await expect(parseSiteManifest(path)).rejects.toThrow('missing required "name" field')
  })

  it('throws on file not found', async () => {
    await expect(parseSiteManifest('/nonexistent/site.yaml')).rejects.toThrow('File not found')
  })
})

describe('parsePageManifest', () => {
  it('parses a valid page.yaml', async () => {
    const path = await writeYaml('page.yaml', `
route: /home
template: page-default
metadata:
  title: "Home"
components:
  - "@header"
  - hero
  - "@footer"
`)
    const result = await parsePageManifest(path)
    expect(result.route).toBe('/home')
    expect(result.template).toBe('page-default')
    expect(result.metadata?.title).toBe('Home')
    expect(result.components).toEqual(['@header', 'hero', '@footer'])
  })

  it('throws on missing route', async () => {
    const path = await writeYaml('page.yaml', 'template: default')
    await expect(parsePageManifest(path)).rejects.toThrow('missing required field(s): route')
  })

  it('throws on missing template', async () => {
    const path = await writeYaml('page.yaml', 'route: /')
    await expect(parsePageManifest(path)).rejects.toThrow('missing required field(s): template')
  })

  it('throws on missing both route and template', async () => {
    const path = await writeYaml('page.yaml', 'components: []')
    await expect(parsePageManifest(path)).rejects.toThrow('route, template')
  })

  it('handles page without components', async () => {
    const path = await writeYaml('page.yaml', 'route: /\ntemplate: default')
    const result = await parsePageManifest(path)
    expect(result.components).toBeUndefined()
  })
})

describe('parseFragmentManifest', () => {
  it('parses a valid fragment.yaml', async () => {
    const path = await writeYaml('fragment.yaml', `
template: header-layout
components:
  - logo
  - nav
`)
    const result = await parseFragmentManifest(path)
    expect(result.template).toBe('header-layout')
    expect(result.components).toEqual(['logo', 'nav'])
  })

  it('throws on missing template', async () => {
    const path = await writeYaml('fragment.yaml', 'components:\n  - logo')
    await expect(parseFragmentManifest(path)).rejects.toThrow('missing required "template" field')
  })

  it('handles fragment with content', async () => {
    const path = await writeYaml('fragment.yaml', `
template: hero
content:
  title: "Hello"
`)
    const result = await parseFragmentManifest(path)
    expect(result.content?.title).toBe('Hello')
  })
})

describe('parseComponentManifest', () => {
  it('parses a valid component.yaml', async () => {
    const path = await writeYaml('component.yaml', `
template: hero
content:
  title: "Welcome"
  subtitle: "Hello world"
`)
    const result = await parseComponentManifest(path)
    expect(result.template).toBe('hero')
    expect(result.content?.title).toBe('Welcome')
    expect(result.content?.subtitle).toBe('Hello world')
  })

  it('throws on missing template', async () => {
    const path = await writeYaml('component.yaml', 'content:\n  title: "Hi"')
    await expect(parseComponentManifest(path)).rejects.toThrow('missing required "template" field')
  })

  it('throws on invalid YAML', async () => {
    const path = await writeYaml('component.yaml', ':\n  bad: [yaml')
    await expect(parseComponentManifest(path)).rejects.toThrow('YAML parse error')
  })

  it('throws on empty file', async () => {
    const path = await writeYaml('component.yaml', '')
    await expect(parseComponentManifest(path)).rejects.toThrow('Expected a YAML object')
  })
})
