/**
 * Gazetta Node production server — serves pages from any StorageProvider
 * with ESI fragment assembly. Same role as the Cloudflare Worker, but
 * runs on Node/Bun for self-hosted deployments (VPS, Docker, Fly.io).
 */

import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { createHash } from 'node:crypto'
import type { StorageProvider } from './types.js'
import { assembleEsi, parseCacheComment, splitFragment, findEsiPaths } from './assemble.js'

export interface ServeOptions {
  storage: StorageProvider
}

export function createServer(options: ServeOptions) {
  const { storage } = options
  const app = new Hono()

  app.use(logger())
  app.get('/health', (c) => c.json({ ok: true }))

  // Hashed CSS/JS — immutable cache
  app.get('/pages/*', async (c) => serveAsset(c, storage))
  app.get('/fragments/*', async (c) => serveAsset(c, storage))

  // Page serving with ESI assembly
  app.get('*', async (c) => {
    const requestPath = new URL(c.req.url).pathname

    const pageHtml = await findPage(storage, requestPath)
    if (!pageHtml) {
      // Try custom 404 page
      const notFoundHtml = await findPage(storage, '/404')
      if (notFoundHtml) {
        const { html: raw404 } = parseCacheComment(notFoundHtml)
        const fragPaths = findEsiPaths(raw404)
        const fragEntries = await Promise.all(
          fragPaths.map(async (p) => {
            try { return [p, splitFragment(await storage.readFile(p.slice(1)))] as const }
            catch { return [p, { head: '', body: '' }] as const }
          })
        )
        return c.html(assembleEsi(raw404, new Map(fragEntries)), 404)
      }
      return c.html('<h1>404 — Page not found</h1>', 404)
    }

    const { html: rawHtml, browser, edge } = parseCacheComment(pageHtml)

    // Fetch all fragments in parallel
    const fragmentPaths = findEsiPaths(rawHtml)
    const fragmentEntries = await Promise.all(
      fragmentPaths.map(async (path) => {
        try {
          const html = await storage.readFile(path.slice(1))
          return [path, splitFragment(html)] as const
        } catch {
          return [path, { head: '', body: `<!-- fragment not found: ${path} -->` }] as const
        }
      })
    )

    const html = assembleEsi(rawHtml, new Map(fragmentEntries))

    const etag = `"${createHash('sha256').update(html).digest('hex').slice(0, 16)}"`
    if (c.req.header('If-None-Match') === etag) {
      return new Response(null, { status: 304, headers: { ETag: etag } })
    }

    return c.html(html, 200, {
      'Cache-Control': `public, max-age=${browser}, s-maxage=${edge}`,
      'ETag': etag,
    })
  })

  return app
}

async function serveAsset(c: any, storage: StorageProvider) {
  const path = new URL(c.req.url).pathname.slice(1)
  try {
    const content = await storage.readFile(path)
    const ext = path.split('.').pop()
    const contentType = ext === 'css' ? 'text/css' : ext === 'js' ? 'text/javascript' : 'text/html'
    return new Response(content, {
      headers: {
        'Content-Type': `${contentType}; charset=utf-8`,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch {
    return c.notFound()
  }
}

async function findPage(storage: StorageProvider, requestPath: string): Promise<string | null> {
  const pagePath = requestPath === '/' ? 'pages/home/index.html' : `pages${requestPath}/index.html`

  try {
    return await storage.readFile(pagePath)
  } catch { /* not found */ }

  // Dynamic segments — list parent dir, find [param] entries
  const parts = requestPath.split('/').filter(Boolean)
  for (let i = parts.length - 1; i >= 0; i--) {
    const parentDir = parts.slice(0, i).join('/')
    const prefix = parentDir ? `pages/${parentDir}` : 'pages'
    try {
      const entries = await storage.readDir(prefix)
      for (const entry of entries) {
        if (entry.isDirectory && entry.name.startsWith('[') && entry.name.endsWith(']')) {
          const dynamicParts = [...parts]
          dynamicParts[i] = entry.name
          try {
            return await storage.readFile(`pages/${dynamicParts.join('/')}/index.html`)
          } catch { /* not found */ }
        }
      }
    } catch { /* dir not found */ }
  }

  return null
}
