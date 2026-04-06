import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { resolve } from 'node:path'
import { GenericContainer, type StartedTestContainer } from 'testcontainers'
import { createFilesystemProvider, createS3Provider } from '@gazetta/renderer'
import {
  publishPageRendered,
  publishFragmentRendered,
  publishSiteManifest,
} from '../src/server/publish-rendered.js'

const starterDir = resolve(import.meta.dirname, '../../../examples/starter')

describe('Worker caching', () => {
  let container: StartedTestContainer
  let app: typeof import('../../sites/gazetta.studio/worker/src/index.js').default

  beforeAll(async () => {
    container = await new GenericContainer('minio/minio')
      .withExposedPorts({ container: 9000, host: 9000 })
      .withCommand(['server', '/data'])
      .withEnvironment({ MINIO_ROOT_USER: 'minioadmin', MINIO_ROOT_PASSWORD: 'minioadmin' })
      .start()

    const port = container.getMappedPort(9000)
    const endpoint = `http://${container.getHost()}:${port}`

    process.env.S3_ENDPOINT = endpoint
    process.env.S3_BUCKET = 'worker-cache-test'
    process.env.S3_ACCESS_KEY_ID = 'minioadmin'
    process.env.S3_SECRET_ACCESS_KEY = 'minioadmin'
    process.env.S3_REGION = 'us-east-1'

    const target = createS3Provider({ endpoint, bucket: 'worker-cache-test', accessKeyId: 'minioadmin', secretAccessKey: 'minioadmin', region: 'us-east-1' })
    await target.init()

    const source = createFilesystemProvider()
    await publishSiteManifest(source, starterDir, target)
    await publishFragmentRendered('header', source, starterDir, target)
    await publishFragmentRendered('footer', source, starterDir, target)
    await publishPageRendered('home', source, starterDir, target)
    await publishPageRendered('about', source, starterDir, target)

    const mod = await import('../../../sites/gazetta.studio/worker/src/index.js')
    app = mod.default
  }, 120000)

  afterAll(async () => {
    if (container) await container.stop()
  })

  beforeEach(async () => {
    await app.request('/purge/all', { method: 'POST' })
  })

  it('serves a page from S3', async () => {
    const res = await app.request('/')
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('Welcome to Gazetta')
  })

  it('returns X-Cache: MISS on first request', async () => {
    const res = await app.request('/')
    expect(res.headers.get('x-cache')).toBe('MISS')
  })

  it('returns X-Cache: HIT on second request', async () => {
    await app.request('/')
    const res = await app.request('/')
    expect(res.headers.get('x-cache')).toBe('HIT')
  })

  it('sets Cache-Control header', async () => {
    const res = await app.request('/')
    expect(res.headers.get('cache-control')).toContain('s-maxage=86400')
  })

  it('purge-all clears all cached pages', async () => {
    await app.request('/')
    await app.request('/about')

    // Both cached
    expect((await app.request('/')).headers.get('x-cache')).toBe('HIT')
    expect((await app.request('/about')).headers.get('x-cache')).toBe('HIT')

    // Purge
    const purge = await app.request('/purge/all', { method: 'POST' })
    expect(purge.status).toBe(200)

    // Both miss
    expect((await app.request('/')).headers.get('x-cache')).toBe('MISS')
    expect((await app.request('/about')).headers.get('x-cache')).toBe('MISS')
  })

  it('purge-urls clears only specified pages', async () => {
    await app.request('/')
    await app.request('/about')

    // Purge only /
    const purge = await app.request('/purge/urls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: ['/'] }),
    })
    expect(purge.status).toBe(200)

    // / is miss, /about is still hit
    expect((await app.request('/')).headers.get('x-cache')).toBe('MISS')
    expect((await app.request('/about')).headers.get('x-cache')).toBe('HIT')
  })

  it('returns 404 for unknown routes', async () => {
    const res = await app.request('/nonexistent')
    expect(res.status).toBe(404)
  })
})
