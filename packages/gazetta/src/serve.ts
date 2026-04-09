import { Hono } from 'hono'
import { createHash } from 'node:crypto'
import type { StorageProvider } from './types.js'
import { assembleEsi, parseCacheComment, splitFragment, findEsiPaths } from './assemble.js'

export interface ServeOptions {
  storage: StorageProvider
}

export function createServer(options: ServeOptions) {
  const { storage } = options
  const app = new Hono()

  // Health check
  app.get('/health', (c) => c.json({ ok: true }))

  // Static assets (hashed CSS/JS) — immutable cache
  app.get('/pages/*', async (c) => serveStatic(c, storage))
  app.get('/fragments/*', async (c) => serveStatic(c, storage))

  // Detect mode: ESI (pages/ dir) or static (files at URL paths)
  let esiMode: boolean | null = null

  app.get('*', async (c) => {
    if (esiMode === null) esiMode = await storage.exists('pages')
    const requestPath = new URL(c.req.url).pathname

    const pageHtml = esiMode
      ? await findPageEsi(storage, requestPath)
      : await findPageStatic(storage, requestPath)
    if (!pageHtml) return c.html('<h1>404 — Page not found</h1>', 404)

    let html: string
    let browser = 0

    if (esiMode) {
      const parsed = parseCacheComment(pageHtml)
      browser = parsed.browser

      // Read all fragments in parallel
      const fragmentPaths = findEsiPaths(parsed.html)
      const fragmentEntries = await Promise.all(
        fragmentPaths.map(async (path) => {
          const key = path.slice(1) // strip leading /
          try {
            const fragHtml = await storage.readFile(key)
            return [path, splitFragment(fragHtml)] as const
          } catch {
            return [path, { head: '', body: `<!-- fragment not found: ${path} -->` }] as const
          }
        })
      )
      html = assembleEsi(parsed.html, new Map(fragmentEntries))
    } else {
      html = pageHtml
    }

    // ETag
    const etag = `"${createHash('sha256').update(html).digest('hex').slice(0, 16)}"`
    if (c.req.header('If-None-Match') === etag) {
      return new Response(null, { status: 304, headers: { ETag: etag } })
    }

    return c.html(html, 200, {
      'Cache-Control': `public, max-age=${browser}`,
      'ETag': etag,
    })
  })

  return app
}

async function serveStatic(c: any, storage: StorageProvider) {
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

async function findPageStatic(storage: StorageProvider, requestPath: string): Promise<string | null> {
  const filePath = requestPath === '/' ? 'index.html' : `${requestPath.replace(/^\//, '')}/index.html`
  try {
    return await storage.readFile(filePath)
  } catch { return null }
}

async function findPageEsi(storage: StorageProvider, requestPath: string): Promise<string | null> {
  const pagePath = requestPath === '/' ? 'pages/home/index.html' : `pages${requestPath}/index.html`

  try {
    return await storage.readFile(pagePath)
  } catch { /* not found */ }

  // Try dynamic segments — list parent directory, find [param] entries
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
          const dynamicPath = `pages/${dynamicParts.join('/')}/index.html`
          try {
            return await storage.readFile(dynamicPath)
          } catch { /* not found */ }
        }
      }
    } catch { /* dir not found */ }
  }

  return null
}
