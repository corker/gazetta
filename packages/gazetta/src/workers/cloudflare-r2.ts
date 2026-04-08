/// <reference types="@cloudflare/workers-types" />

/**
 * Gazetta Cloudflare Worker — serves pages from R2 with ESI fragment assembly.
 *
 * Reads pre-rendered pages and fragments from an R2 bucket,
 * assembles them using ESI-style composition, and serves with
 * Cache API + ETag support.
 *
 * Usage: import and re-export from your worker entry point:
 *
 *   import { createWorker } from 'gazetta/workers/cloudflare-r2'
 *   export default createWorker()
 *
 * Or customize:
 *
 *   import { createWorker } from 'gazetta/workers/cloudflare-r2'
 *   const worker = createWorker({ bucketBinding: 'SITE_BUCKET' })
 *   export default worker
 */

import { Hono } from 'hono'
import { assembleEsi, parseCacheComment, splitFragment, findEsiPaths } from '../assemble.js'

export interface CloudflareR2WorkerOptions {
  /** R2 bucket binding name (default: 'SITE_BUCKET') */
  bucketBinding?: string
  /** Custom middleware to add before page serving */
  middleware?: (app: Hono<{ Bindings: Record<string, R2Bucket> }>) => void
}

export function createWorker(options?: CloudflareR2WorkerOptions) {
  const bindingName = options?.bucketBinding ?? 'SITE_BUCKET'

  const app = new Hono<{ Bindings: Record<string, R2Bucket> }>()

  // Custom middleware (e.g., www redirect, auth)
  if (options?.middleware) options.middleware(app)

  // Health check
  app.get('/health', async (c) => {
    const bucket = c.env[bindingName]
    const pages = await bucket.list({ prefix: 'pages/', delimiter: '/' })
    const fragments = await bucket.list({ prefix: 'fragments/', delimiter: '/' })
    return c.json({ ok: true, pages: pages.delimitedPrefixes.length, fragments: fragments.delimitedPrefixes.length })
  })

  // Static assets (CSS, JS) — immutable cache
  app.get('/pages/*', async (c) => serveStatic(c, c.env[bindingName]))
  app.get('/fragments/*', async (c) => serveStatic(c, c.env[bindingName]))

  // Page serving with ESI assembly + Cache API
  app.get('*', async (c) => {
    const request = c.req.raw
    const cache = (caches as unknown as { default: Cache }).default

    const cached = await cache.match(request)
    if (cached) return cached

    const bucket = c.env[bindingName]
    const requestPath = new URL(c.req.url).pathname

    const pageHtml = await findPage(bucket, requestPath)
    if (!pageHtml) return c.html('<h1>404 — Page not found</h1>', 404)

    const { html: rawHtml, browser, edge } = parseCacheComment(pageHtml)

    // Read all fragments in parallel
    const fragmentPaths = findEsiPaths(rawHtml)
    const fragmentEntries = await Promise.all(
      fragmentPaths.map(async (path) => {
        const key = path.slice(1)
        const obj = await bucket.get(key)
        if (!obj) return [path, { head: '', body: `<!-- fragment not found: ${path} -->` }] as const
        return [path, splitFragment(await obj.text())] as const
      })
    )
    const fragments = new Map(fragmentEntries)

    const assembled = assembleEsi(rawHtml, fragments)

    // Compute ETag
    const encoder = new TextEncoder()
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(assembled))
    const etag = `"${[...new Uint8Array(hashBuffer)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16)}"`

    if (c.req.header('If-None-Match') === etag) {
      return new Response(null, { status: 304, headers: { 'ETag': etag } })
    }

    const response = new Response(assembled, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': `public, max-age=${browser}, s-maxage=${edge}`,
        'ETag': etag,
      },
    })

    c.executionCtx.waitUntil(cache.put(request, response.clone()))
    return response
  })

  return app
}

async function serveStatic(c: any, bucket: R2Bucket) {
  const path = new URL(c.req.url).pathname.slice(1)
  const obj = await bucket.get(path)
  if (!obj) return c.notFound()

  const ext = path.split('.').pop()
  const contentType = ext === 'css' ? 'text/css' : ext === 'js' ? 'text/javascript' : 'text/html'
  return new Response(obj.body as ReadableStream, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}

async function findPage(bucket: R2Bucket, requestPath: string): Promise<string | null> {
  const pagePath = requestPath === '/' ? 'pages/home/index.html'
    : `pages${requestPath}/index.html`

  const obj = await bucket.get(pagePath)
  if (obj) return await obj.text()

  // Try dynamic segments — list parent directory, find [param] entries
  const parts = requestPath.split('/').filter(Boolean)
  for (let i = parts.length - 1; i >= 0; i--) {
    const parentDir = parts.slice(0, i).join('/')
    const prefix = parentDir ? `pages/${parentDir}/` : 'pages/'
    const listed = await bucket.list({ prefix, delimiter: '/' })
    for (const item of listed.delimitedPrefixes) {
      const segment = item.replace(prefix, '').replace(/\/$/, '')
      if (segment.startsWith('[') && segment.endsWith(']')) {
        const dynamicParts = [...parts]
        dynamicParts[i] = segment
        const dynamicPath = `pages/${dynamicParts.join('/')}/index.html`
        const dynObj = await bucket.get(dynamicPath)
        if (dynObj) return await dynObj.text()
      }
    }
  }

  return null
}
