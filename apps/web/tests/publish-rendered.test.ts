import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { resolve } from 'node:path'
import { GenericContainer, type StartedTestContainer } from 'testcontainers'
import { createFilesystemProvider, createS3Provider } from '@gazetta/renderer'
import {
  publishPageRendered,
  publishFragmentRendered,
  publishSiteManifest,
  publishFragmentIndex,
  type PublishedPageManifest,
  type PublishedComponent,
} from '../src/server/publish-rendered.js'

const starterDir = resolve(import.meta.dirname, '../../../examples/starter')

describe('rendered publish (MinIO)', () => {
  let container: StartedTestContainer
  const source = createFilesystemProvider()
  let target: ReturnType<typeof createS3Provider>

  beforeAll(async () => {
    container = await new GenericContainer('minio/minio')
      .withExposedPorts({ container: 9000, host: 9000 })
      .withCommand(['server', '/data'])
      .withEnvironment({ MINIO_ROOT_USER: 'minioadmin', MINIO_ROOT_PASSWORD: 'minioadmin' })
      .start()

    target = createS3Provider({
      endpoint: `http://${container.getHost()}:${container.getMappedPort(9000)}`,
      bucket: 'publish-test',
      accessKeyId: 'minioadmin',
      secretAccessKey: 'minioadmin',
      region: 'us-east-1',
    })
    await target.init()
  }, 60000)

  afterAll(async () => {
    if (container) await container.stop()
  })

  it('publishes site manifest', async () => {
    await publishSiteManifest(source, starterDir, target)
    const json = JSON.parse(await target.readFile('site.json'))
    expect(json.name).toBe('Gazetta Starter')
  })

  it('publishes a fragment as pre-rendered JSON', async () => {
    const result = await publishFragmentRendered('header', source, starterDir, target)
    expect(result.files).toBe(1)

    const json: PublishedComponent = JSON.parse(await target.readFile('components/@header.json'))
    expect(json.html).toContain('Gazetta')
    expect(json.html).toContain('href')
    expect(json.css.length).toBeGreaterThan(0)
  })

  it('publishes a page with pre-rendered components', async () => {
    await publishFragmentRendered('footer', source, starterDir, target)
    const result = await publishPageRendered('home', source, starterDir, target)
    expect(result.files).toBeGreaterThan(3)

    // Check page manifest
    const manifest: PublishedPageManifest = JSON.parse(await target.readFile('pages/home.json'))
    expect(manifest.route).toBe('/')
    expect(manifest.components.length).toBeGreaterThan(0)
    expect(manifest.components).toContain('@header')

    // Check a local component was rendered
    const heroKey = manifest.components.find(c => c.includes('hero'))
    expect(heroKey).toBeDefined()
    const hero: PublishedComponent = JSON.parse(await target.readFile(`components/${heroKey}.json`))
    expect(hero.html).toContain('Welcome to Gazetta')

    // Check layout was stored
    const layout = JSON.parse(await target.readFile('pages/home.layout.json'))
    expect(layout.css.length).toBeGreaterThan(0)
  })

  it('builds reverse fragment index', async () => {
    const index = await publishFragmentIndex(source, starterDir, target)
    expect(index['@header']).toContain('/')
    expect(index['@header']).toContain('/about')
    expect(index['@footer']).toContain('/')

    // Verify stored in S3
    const stored = JSON.parse(await target.readFile('index/fragments.json'))
    expect(stored).toEqual(index)
  })

  it('pre-rendered components have correct shape', async () => {
    const json: PublishedComponent = JSON.parse(await target.readFile('components/@header.json'))
    expect(typeof json.html).toBe('string')
    expect(typeof json.css).toBe('string')
    expect(typeof json.js).toBe('string')
    expect(json.html.length).toBeGreaterThan(0)
  })
})
