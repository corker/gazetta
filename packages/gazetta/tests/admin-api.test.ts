import { describe, it, expect, afterAll } from 'vitest'
import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Hono } from 'hono'
import { createFilesystemProvider } from '../src/providers/filesystem.js'
import { createAdminApp } from '../src/admin-api/index.js'

const starterDir = resolve(import.meta.dirname, '../../../examples/starter')
const storage = createFilesystemProvider()
const app: Hono = createAdminApp(starterDir, storage)

async function get(path: string) {
  const res = await app.request(path)
  return { status: res.status, body: await res.json() }
}

async function getText(path: string) {
  const res = await app.request(path)
  return { status: res.status, body: await res.text() }
}

describe('GET /api/site', () => {
  it('returns site manifest', async () => {
    const { status, body } = await get('/api/site')
    expect(status).toBe(200)
    expect(body.name).toBe('Gazetta Starter')
  })
})

describe('GET /api/pages', () => {
  it('returns all pages', async () => {
    const { status, body } = await get('/api/pages')
    expect(status).toBe(200)
    expect(body).toHaveLength(3)
    const names = body.map((p: { name: string }) => p.name)
    expect(names).toContain('home')
    expect(names).toContain('about')
    expect(names).toContain('blog/[slug]')
  })

  it('pages have route and template', async () => {
    const { body } = await get('/api/pages')
    const home = body.find((p: { name: string }) => p.name === 'home')
    expect(home.route).toBe('/')
    expect(home.template).toBe('page-default')
  })
})

describe('GET /api/pages/:name', () => {
  it('returns page detail', async () => {
    const { status, body } = await get('/api/pages/home')
    expect(status).toBe(200)
    expect(body.route).toBe('/')
    expect(body.components).toContain('@header')
    expect(body.components).toContain('hero')
    expect(body.components).toContain('@footer')
  })

  it('returns nested page', async () => {
    const { status, body } = await get('/api/pages/blog/[slug]')
    expect(status).toBe(200)
    expect(body.route).toBe('/blog/:slug')
  })

  it('returns 404 for missing page', async () => {
    const { status } = await get('/api/pages/nonexistent')
    expect(status).toBe(404)
  })
})

describe('GET /api/fragments', () => {
  it('returns all fragments', async () => {
    const { status, body } = await get('/api/fragments')
    expect(status).toBe(200)
    expect(body).toHaveLength(2)
    const names = body.map((f: { name: string }) => f.name)
    expect(names).toContain('header')
    expect(names).toContain('footer')
  })
})

describe('GET /api/fragments/:name', () => {
  it('returns fragment detail', async () => {
    const { status, body } = await get('/api/fragments/header')
    expect(status).toBe(200)
    expect(body.template).toBe('header-layout')
    expect(body.components).toContain('logo')
    expect(body.components).toContain('nav')
  })

  it('returns 404 for missing fragment', async () => {
    const { status } = await get('/api/fragments/nonexistent')
    expect(status).toBe(404)
  })
})

describe('GET /api/templates', () => {
  it('returns all templates', async () => {
    const { status, body } = await get('/api/templates')
    expect(status).toBe(200)
    const names = body.map((t: { name: string }) => t.name)
    expect(names).toContain('hero')
    expect(names).toContain('page-default')
    expect(names).toContain('feature-card')
  })
})

describe('GET /api/templates/:name/schema', () => {
  it('returns JSON Schema for a template', async () => {
    const { status, body } = await get('/api/templates/hero/schema')
    expect(status).toBe(200)
    expect(body.type).toBe('object')
    expect(body.properties.title).toBeDefined()
    expect(body.properties.subtitle).toBeDefined()
  })

  it('returns 500 for missing template', async () => {
    const { status } = await get('/api/templates/nonexistent/schema')
    expect(status).toBe(500)
  })
})

describe('GET /api/components', () => {
  it('returns component manifest', async () => {
    const path = resolve(starterDir, 'pages/home/hero')
    const { status, body } = await get(`/api/components?path=${encodeURIComponent(path)}`)
    expect(status).toBe(200)
    expect(body.template).toBe('hero')
    expect(body.content.title).toBe('Welcome to Gazetta')
  })

  it('returns 400 without path param', async () => {
    const { status } = await get('/api/components')
    expect(status).toBe(400)
  })

  it('returns 404 for missing component', async () => {
    const { status } = await get('/api/components?path=/nonexistent/path')
    expect(status).toBe(404)
  })
})

describe('GET /preview/*', () => {
  it('renders home page', async () => {
    const { status, body } = await getText('/preview/')
    expect(status).toBe(200)
    expect(body).toContain('Welcome to Gazetta')
    expect(body).toContain('<!DOCTYPE html>')
  })

  it('renders about page', async () => {
    const { status, body } = await getText('/preview/about')
    expect(status).toBe(200)
    expect(body).toContain('About Gazetta')
  })

  it('renders dynamic route', async () => {
    const { status, body } = await getText('/preview/blog/hello-world')
    expect(status).toBe(200)
    expect(body).toContain('Hello from Gazetta')
  })

  it('returns 404 for missing route', async () => {
    const { status } = await getText('/preview/nonexistent')
    expect(status).toBe(404)
  })
})

describe('POST /preview/*', () => {
  it('renders with content overrides', async () => {
    const heroPath = resolve(starterDir, 'pages/home/hero')
    const res = await app.request('/preview/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        overrides: { [heroPath]: { title: 'Draft Title', subtitle: 'Draft Subtitle' } },
      }),
    })
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('Draft Title')
    expect(html).toContain('Draft Subtitle')
  })

  it('renders normally without overrides', async () => {
    const res = await app.request('/preview/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('Welcome to Gazetta')
  })
})

describe('POST /api/pages (create)', () => {
  afterAll(async () => {
    await rm(resolve(starterDir, 'pages/test-page'), { recursive: true, force: true })
    await rm(resolve(starterDir, 'pages/docs'), { recursive: true, force: true })
  })

  it('creates a new page', async () => {
    const res = await app.request('/api/pages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'test-page', template: 'page-default' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)

    const { body: pages } = await get('/api/pages')
    expect(pages.some((p: { name: string }) => p.name === 'test-page')).toBe(true)
  })

  it('rejects duplicate page', async () => {
    const res = await app.request('/api/pages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'test-page', template: 'page-default' }),
    })
    expect(res.status).toBe(409)
  })

  it('rejects missing fields', async () => {
    const res = await app.request('/api/pages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'x' }),
    })
    expect(res.status).toBe(400)
  })
})

describe('PUT /api/pages/:name', () => {
  afterAll(async () => {
    await rm(resolve(starterDir, 'pages/update-test'), { recursive: true, force: true })
  })

  it('updates page content', async () => {
    // Create
    await app.request('/api/pages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'update-test', template: 'page-default' }),
    })

    // Update
    const res = await app.request('/api/pages/update-test', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: { title: 'Updated Title' } }),
    })
    expect(res.status).toBe(200)

    // Verify
    const { body } = await get('/api/pages/update-test')
    expect(body.content.title).toBe('Updated Title')
  })

  it('returns 404 for missing page', async () => {
    const res = await app.request('/api/pages/nonexistent', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: {} }),
    })
    expect(res.status).toBe(404)
  })
})

describe('PUT /api/components', () => {
  it('updates component content', async () => {
    const path = resolve(starterDir, 'pages/home/hero')
    const res = await app.request(`/api/components?path=${encodeURIComponent(path)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: { title: 'Updated Hero', subtitle: 'New subtitle' } }),
    })
    expect(res.status).toBe(200)

    // Verify and restore
    const { body } = await get(`/api/components?path=${encodeURIComponent(path)}`)
    expect(body.content.title).toBe('Updated Hero')

    // Restore original
    await app.request(`/api/components?path=${encodeURIComponent(path)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: { title: 'Welcome to Gazetta', subtitle: 'A stateless CMS that composes pages from reusable components' } }),
    })
  })

  it('returns 400 without path', async () => {
    const res = await app.request('/api/components', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: {} }),
    })
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/pages/:name', () => {
  it('deletes a page', async () => {
    await app.request('/api/pages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'to-delete', template: 'page-default' }),
    })

    const res = await app.request('/api/pages/to-delete', { method: 'DELETE' })
    expect(res.status).toBe(200)

    const { body: pages } = await get('/api/pages')
    expect(pages.some((p: { name: string }) => p.name === 'to-delete')).toBe(false)
  })

  it('returns 404 for missing page', async () => {
    const res = await app.request('/api/pages/nonexistent', { method: 'DELETE' })
    expect(res.status).toBe(404)
  })
})

describe('POST /api/fragments (create)', () => {
  afterAll(async () => {
    await rm(resolve(starterDir, 'fragments/test-frag'), { recursive: true, force: true })
  })

  it('creates a new fragment', async () => {
    const res = await app.request('/api/fragments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'test-frag', template: 'footer-layout' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  it('rejects missing fields', async () => {
    const res = await app.request('/api/fragments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'x' }),
    })
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/fragments/:name', () => {
  it('deletes a fragment', async () => {
    await app.request('/api/fragments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'to-delete-frag', template: 'footer-layout' }),
    })

    const res = await app.request('/api/fragments/to-delete-frag', { method: 'DELETE' })
    expect(res.status).toBe(200)
  })

  it('returns 404 for missing fragment', async () => {
    const res = await app.request('/api/fragments/nonexistent', { method: 'DELETE' })
    expect(res.status).toBe(404)
  })
})

describe('POST /api/components (create)', () => {
  afterAll(async () => {
    await rm(resolve(starterDir, 'pages/home/test-comp'), { recursive: true, force: true })
  })

  it('creates a new component', async () => {
    const parentDir = resolve(starterDir, 'pages/home')
    const res = await app.request('/api/components', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentDir, name: 'test-comp', template: 'hero' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.path).toContain('test-comp')
  })

  it('rejects missing fields', async () => {
    const res = await app.request('/api/components', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'x' }),
    })
    expect(res.status).toBe(400)
  })
})
