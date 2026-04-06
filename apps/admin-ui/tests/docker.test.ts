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

  it('publishes a fragment as HTML with hashed CSS', async () => {
    const result = await publishFragmentRendered('header', source, starterDir, target)
    expect(result.files).toBeGreaterThanOrEqual(2) // index.html + styles.{hash}.css
    const html = await target.readFile('fragments/header/index.html')
    expect(html).toContain('<head>')
    expect(html).toContain('stylesheet')
    expect(html).toContain('Gazetta') // body markup
  })

  it('publishes a page as HTML with ESI placeholders', async () => {
    await publishFragmentRendered('footer', source, starterDir, target)
    const result = await publishPageRendered('home', source, starterDir, target)
    expect(result.files).toBeGreaterThanOrEqual(2) // index.html + styles.{hash}.css

    const html = await target.readFile('pages/home/index.html')
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<!--esi:/fragments/header/index.html-->')
    expect(html).toContain('<!--esi-head:/fragments/header/index.html-->')
    expect(html).toContain('Welcome to Gazetta') // local component baked in
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

    // Build a test app with ESI assembly (same logic as the Cloudflare Worker)
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

      // Find page by URL convention
      const pagePath = path === '/' ? 'pages/home/index.html' : `pages${path}/index.html`
      let pageHtml: string
      try { pageHtml = await storage.readFile(pagePath) } catch { return c.html('404', 404) }

      // ESI assembly: collect esi-head tags, read fragments, replace
      const esiHeadRegex = /<!--esi-head:(\/[^>]+)-->/g
      const esiBodyRegex = /<!--esi:(\/[^>]+)-->/g
      const fragmentPaths = new Set<string>()
      let m
      while ((m = esiHeadRegex.exec(pageHtml)) !== null) fragmentPaths.add(m[1])
      while ((m = esiBodyRegex.exec(pageHtml)) !== null) fragmentPaths.add(m[1])

      const fragments = new Map<string, { head: string; body: string }>()
      for (const fp of fragmentPaths) {
        try {
          const fragHtml = await storage.readFile(fp.slice(1))
          const hs = fragHtml.indexOf('<head>'), he = fragHtml.indexOf('</head>')
          if (hs !== -1 && he !== -1) {
            fragments.set(fp, { head: fragHtml.slice(hs + 6, he).trim(), body: (fragHtml.slice(0, hs) + fragHtml.slice(he + 7)).trim() })
          } else {
            fragments.set(fp, { head: '', body: fragHtml })
          }
        } catch { fragments.set(fp, { head: '', body: `<!-- not found: ${fp} -->` }) }
      }

      const headLines = new Set<string>()
      let html = pageHtml.replace(/<!--esi-head:(\/[^>]+)-->/g, (_m, p: string) => {
        const frag = fragments.get(p)
        if (frag?.head) for (const line of frag.head.split('\n').map((l: string) => l.trim()).filter(Boolean)) headLines.add(line)
        return ''
      })
      if (headLines.size > 0) html = html.replace('</head>', `  ${[...headLines].join('\n  ')}\n</head>`)
      html = html.replace(/<!--esi:(\/[^>]+)-->/g, (_m, p: string) => fragments.get(p)?.body ?? '')

      cache.set(path, { html, at: Date.now() })
      return c.html(html, 200, { 'Cache-Control': 'public, s-maxage=86400', 'X-Cache': 'MISS' })
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
