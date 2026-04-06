/**
 * All tests that require Docker (MinIO + Azurite via docker-compose).
 * Docker-compose starts once, shared across all describe blocks.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { resolve } from 'node:path'
import { DockerComposeEnvironment, type StartedDockerComposeEnvironment } from 'testcontainers'
import { createFilesystemProvider, createS3Provider, createAzureBlobProvider } from 'gazetta'
import { publishItems, resolveDependencies } from 'gazetta'
import {
  publishPageRendered,
  publishFragmentRendered,
  publishSiteManifest,
  publishFragmentIndex,
  type PublishedPageManifest,
  type PublishedComponent,
} from 'gazetta'

const starterDir = resolve(import.meta.dirname, '../../../examples/starter')
const composeDir = resolve(import.meta.dirname, '../../..')

let env: StartedDockerComposeEnvironment
let minioEndpoint: string
let azuritePort: number

beforeAll(async () => {
  env = await new DockerComposeEnvironment(composeDir, 'docker-compose.yml').up()

  minioEndpoint = 'http://localhost:9000'
  azuritePort = 10000
}, 120000)

afterAll(async () => {
  if (env) await env.down()
})

function s3(bucket: string) {
  const provider = createS3Provider({
    endpoint: minioEndpoint,
    bucket,
    accessKeyId: 'minioadmin',
    secretAccessKey: 'minioadmin',
    region: 'us-east-1',
  })
  return provider
}

// ---- S3 Storage Provider ----

describe('S3 storage provider (MinIO)', () => {
  let provider: ReturnType<typeof createS3Provider>

  beforeAll(async () => {
    provider = s3('s3-provider-test')
    await provider.init()
  })

  it('writes and reads a file', async () => {
    await provider.writeFile('test.txt', 'hello world')
    expect(await provider.readFile('test.txt')).toBe('hello world')
  })

  it('checks file exists', async () => {
    await provider.writeFile('exists.txt', 'yes')
    expect(await provider.exists('exists.txt')).toBe(true)
    expect(await provider.exists('nope.txt')).toBe(false)
  })

  it('reads directory entries', async () => {
    await provider.writeFile('dir/a.txt', 'a')
    await provider.writeFile('dir/b.txt', 'b')
    await provider.writeFile('dir/sub/c.txt', 'c')

    const entries = await provider.readDir('dir')
    const names = entries.map(e => e.name)
    expect(names).toContain('a.txt')
    expect(names).toContain('b.txt')
    expect(names).toContain('sub')
    expect(entries.find(e => e.name === 'sub')?.isDirectory).toBe(true)
    expect(entries.find(e => e.name === 'a.txt')?.isDirectory).toBe(false)
  })

  it('checks directory exists', async () => {
    await provider.writeFile('mydir/file.txt', 'content')
    expect(await provider.exists('mydir')).toBe(true)
    expect(await provider.exists('nonexistent-dir')).toBe(false)
  })

  it('throws on reading nonexistent file', async () => {
    await expect(provider.readFile('missing.txt')).rejects.toThrow()
  })

  it('deletes files', async () => {
    await provider.writeFile('to-delete.txt', 'bye')
    await provider.rm('to-delete.txt')
    expect(await provider.exists('to-delete.txt')).toBe(false)
  })

  it('deletes directory recursively', async () => {
    await provider.writeFile('rmdir/a.txt', 'a')
    await provider.writeFile('rmdir/b.txt', 'b')
    await provider.rm('rmdir')
    expect(await provider.exists('rmdir/a.txt')).toBe(false)
  })

  it('mkdir is a no-op', async () => {
    await provider.mkdir('some/nested/dir')
  })
})

// ---- Azure Blob (Azurite) ----

describe('Azure Blob publish (Azurite)', () => {
  const source = createFilesystemProvider()
  let blobProvider: ReturnType<typeof createAzureBlobProvider>

  beforeAll(async () => {
    blobProvider = createAzureBlobProvider({
      connectionString: 'UseDevelopmentStorage=true',
      container: 'gazetta-test',
    })
    await blobProvider.init()
  })

  it('publishes a page to Azure Blob', async () => {
    const allItems = await resolveDependencies(source, starterDir, ['pages/home'])
    const { copiedFiles } = await publishItems(source, starterDir, blobProvider, '', allItems)
    expect(copiedFiles).toBeGreaterThan(10)
    expect(await blobProvider.exists('pages/home/page.yaml')).toBe(true)
  })

  it('reads back published content', async () => {
    const content = await blobProvider.readFile('pages/home/page.yaml')
    expect(content).toContain('route:')
  })

  it('lists published files', async () => {
    const entries = await blobProvider.readDir('pages/home')
    expect(entries.map(e => e.name)).toContain('page.yaml')
  })
})

// ---- Rendered Publish (MinIO) ----

describe('Rendered publish (MinIO)', () => {
  const source = createFilesystemProvider()
  let target: ReturnType<typeof createS3Provider>

  beforeAll(async () => {
    target = s3('publish-rendered-test')
    await target.init()
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
    expect(json.css.length).toBeGreaterThan(0)
  })

  it('publishes a page with pre-rendered components', async () => {
    await publishFragmentRendered('footer', source, starterDir, target)
    const result = await publishPageRendered('home', source, starterDir, target)
    expect(result.files).toBeGreaterThan(3)

    const manifest: PublishedPageManifest = JSON.parse(await target.readFile('pages/home.json'))
    expect(manifest.route).toBe('/')
    expect(manifest.components).toContain('@header')

    const heroKey = manifest.components.find(c => c.includes('hero'))!
    const hero: PublishedComponent = JSON.parse(await target.readFile(`components/${heroKey}.json`))
    expect(hero.html).toContain('Welcome to Gazetta')
  })

  it('builds reverse fragment index', async () => {
    const index = await publishFragmentIndex(source, starterDir, target)
    expect(index['@header']).toContain('/')
    expect(index['@footer']).toContain('/')
    const stored = JSON.parse(await target.readFile('index/fragments.json'))
    expect(stored).toEqual(index)
  })
})

// ---- Edge Composition (S3-based, same logic as Cloudflare Worker with R2) ----

describe('Edge composition caching (MinIO)', () => {
  let app: import('hono').Hono

  beforeAll(async () => {
    const target = s3('worker-cache-test')
    await target.init()

    const source = createFilesystemProvider()
    await publishSiteManifest(source, starterDir, target)
    await publishFragmentRendered('header', source, starterDir, target)
    await publishFragmentRendered('footer', source, starterDir, target)
    await publishPageRendered('home', source, starterDir, target)
    await publishPageRendered('about', source, starterDir, target)

    // Build a test app that uses S3 storage (same assembly logic as the R2 worker)
    const { Hono } = await import('hono')
    const storage = target
    const cache = new Map<string, { html: string; at: number }>()
    const TTL = 86400_000

    app = new Hono()

    app.post('/purge/all', () => { cache.clear(); return new Response(JSON.stringify({ purged: 'all' })) })
    app.post('/purge/urls', async (c) => {
      const { urls } = await c.req.json() as { urls: string[] }
      let purged = 0
      for (const url of urls) { if (cache.delete(url)) purged++ }
      return c.json({ purged })
    })

    app.get('*', async (c) => {
      const path = new URL(c.req.url).pathname
      const hit = cache.get(path)
      if (hit && Date.now() - hit.at < TTL) {
        return c.html(hit.html, 200, { 'Cache-Control': 'public, s-maxage=86400', 'X-Cache': 'HIT' })
      }

      // List page manifests
      let pageEntries: Array<{ name: string }>
      try { pageEntries = await storage.readDir('pages') } catch { return c.html('404', 404) }

      for (const entry of pageEntries) {
        if (!entry.name.endsWith('.json') || entry.name.endsWith('.layout.json')) continue
        const pageName = entry.name.replace('.json', '')
        let manifest: { route: string; metadata?: Record<string, unknown>; components: string[] }
        try { manifest = JSON.parse(await storage.readFile(`pages/${entry.name}`)) } catch { continue }

        // Match route
        const rp = manifest.route.split('/'), pp = path.split('/')
        if (rp.length !== pp.length) continue
        let match = true
        for (let i = 0; i < rp.length; i++) { if (!rp[i].startsWith(':') && rp[i] !== pp[i]) { match = false; break } }
        if (!match) continue

        const components: Array<{ html: string; css: string; js: string; head?: string }> = []
        for (const key of manifest.components) {
          components.push(JSON.parse(await storage.readFile(`components/${key}.json`)))
        }
        let layoutCss = '', layoutHead = ''
        try {
          const layout = JSON.parse(await storage.readFile(`pages/${pageName}.layout.json`))
          layoutCss = layout.css ?? ''; layoutHead = layout.head ?? ''
        } catch { /* optional */ }

        const title = (manifest.metadata?.title as string) ?? 'Gazetta'
        const html = `<!DOCTYPE html><html><head><title>${title}</title><style>${[layoutCss, ...components.map(c => c.css)].join('\n')}</style>${layoutHead}${components.map(c => c.head ?? '').join('')}</head><body>${components.map(c => c.html).join('\n')}</body></html>`
        cache.set(path, { html, at: Date.now() })
        return c.html(html, 200, { 'Cache-Control': 'public, s-maxage=86400', 'X-Cache': 'MISS' })
      }
      return c.html('404', 404)
    })
  })

  beforeEach(async () => {
    await app.request('/purge/all', { method: 'POST' })
  })

  it('serves a page from S3', async () => {
    const res = await app.request('/')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Welcome to Gazetta')
  })

  it('returns MISS then HIT', async () => {
    expect((await app.request('/')).headers.get('x-cache')).toBe('MISS')
    expect((await app.request('/')).headers.get('x-cache')).toBe('HIT')
  })

  it('sets Cache-Control header', async () => {
    const res = await app.request('/')
    expect(res.headers.get('cache-control')).toContain('s-maxage=86400')
  })

  it('purge-all clears cache', async () => {
    await app.request('/')
    await app.request('/about')
    await app.request('/purge/all', { method: 'POST' })
    expect((await app.request('/')).headers.get('x-cache')).toBe('MISS')
    expect((await app.request('/about')).headers.get('x-cache')).toBe('MISS')
  })

  it('purge-urls clears only specified pages', async () => {
    await app.request('/')
    await app.request('/about')
    await app.request('/purge/urls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: ['/'] }),
    })
    expect((await app.request('/')).headers.get('x-cache')).toBe('MISS')
    expect((await app.request('/about')).headers.get('x-cache')).toBe('HIT')
  })

  it('returns 404 for unknown routes', async () => {
    expect((await app.request('/nonexistent')).status).toBe(404)
  })
})

// ---- Filesystem publish (no Docker needed but grouped here) ----

describe('Filesystem publish', () => {
  const source = createFilesystemProvider()
  const stagingDir = resolve(import.meta.dirname, '../../../dist/test-staging')
  const target = createFilesystemProvider(stagingDir)

  afterAll(async () => {
    const { rm } = await import('node:fs/promises')
    await rm(stagingDir, { recursive: true, force: true })
  })

  it('publishes a page with dependencies', async () => {
    const allItems = await resolveDependencies(source, starterDir, ['pages/home'])
    expect(allItems).toContain('pages/home')
    expect(allItems).toContain('templates/hero')
    expect(allItems).toContain('fragments/header')

    const { copiedFiles } = await publishItems(source, starterDir, target, '', allItems)
    expect(copiedFiles).toBeGreaterThan(10)
    expect(await target.exists('pages/home/page.yaml')).toBe(true)
  })

  it('publishes a fragment', async () => {
    const allItems = await resolveDependencies(source, starterDir, ['fragments/header'])
    expect(allItems).toContain('templates/header-layout')
    const { copiedFiles } = await publishItems(source, starterDir, target, '', allItems)
    expect(copiedFiles).toBeGreaterThan(5)
  })
})
