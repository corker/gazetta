import { Hono } from 'hono'
import { createS3Provider } from '@gazetta/renderer'
import type { StorageProvider } from '@gazetta/core'

interface Env {
  S3_ENDPOINT: string
  S3_BUCKET: string
  S3_ACCESS_KEY_ID: string
  S3_SECRET_ACCESS_KEY: string
  S3_REGION?: string
  PURGE_TOKEN?: string
}

interface PageManifest {
  route: string
  metadata?: Record<string, unknown>
  components: string[]
}

interface RenderedComponent {
  html: string
  css: string
  js: string
  head?: string
}

// In-memory cache for Node.js (local dev). On Cloudflare, use Cache API instead.
const memoryCache = new Map<string, { html: string; cachedAt: number }>()
const CACHE_TTL = 86400 * 1000 // 24 hours in ms

function getEnv(c: { env: Env }): Record<string, string> {
  try {
    const g = globalThis as Record<string, unknown>
    if (g['process'] && typeof (g['process'] as Record<string, unknown>).env === 'object') {
      return { ...(g['process'] as { env: Record<string, string> }).env, ...c.env } as Record<string, string>
    }
  } catch { /* Workers runtime — no process */ }
  return c.env as unknown as Record<string, string>
}

function getStorage(env: Record<string, string>): StorageProvider {
  return createS3Provider({
    endpoint: env.S3_ENDPOINT ?? 'http://localhost:9000',
    bucket: env.S3_BUCKET ?? 'gazetta-rendered',
    accessKeyId: env.S3_ACCESS_KEY_ID ?? 'minioadmin',
    secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? 'minioadmin',
    region: env.S3_REGION ?? 'us-east-1',
  })
}

const app = new Hono<{ Bindings: Env }>()

// ---- Purge endpoints ----

// Purge all cached pages
app.post('/purge/all', async (c) => {
  const env = getEnv(c)
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  if (env.PURGE_TOKEN && token !== env.PURGE_TOKEN) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  memoryCache.clear()
  return c.json({ purged: 'all', count: memoryCache.size })
})

// Purge specific URLs (for page publish or pro-tier fragment publish)
app.post('/purge/urls', async (c) => {
  const env = getEnv(c)
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  if (env.PURGE_TOKEN && token !== env.PURGE_TOKEN) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const body = await c.req.json() as { urls: string[] }
  if (!body.urls?.length) return c.json({ error: 'No URLs provided' }, 400)

  let purged = 0
  for (const url of body.urls) {
    if (memoryCache.delete(url)) purged++
  }
  return c.json({ purged, total: body.urls.length })
})

// ---- Page serving with cache ----

app.get('*', async (c) => {
  const requestPath = new URL(c.req.url).pathname

  // Check cache
  const cached = memoryCache.get(requestPath)
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
    return c.html(cached.html, 200, {
      'Cache-Control': 'public, s-maxage=86400',
      'X-Cache': 'HIT',
    })
  }

  // Cache miss — assemble from S3
  const env = getEnv(c)
  const storage = getStorage(env)

  const html = await assemblePage(storage, requestPath)
  if (!html) return c.html('<h1>404 — Page not found</h1>', 404)

  // Cache the assembled page
  memoryCache.set(requestPath, { html, cachedAt: Date.now() })

  return c.html(html, 200, {
    'Cache-Control': 'public, s-maxage=86400',
    'X-Cache': 'MISS',
  })
})

async function assemblePage(storage: StorageProvider, requestPath: string): Promise<string | null> {
  let pageEntries: Array<{ name: string }>
  try {
    pageEntries = await storage.readDir('pages')
  } catch {
    return null
  }

  for (const entry of pageEntries) {
    if (!entry.name.endsWith('.json') || entry.name.endsWith('.layout.json')) continue
    const pageName = entry.name.replace('.json', '')

    let manifest: PageManifest
    try {
      manifest = JSON.parse(await storage.readFile(`pages/${entry.name}`))
    } catch { continue }

    const params = matchRoute(manifest.route, requestPath)
    if (!params) continue

    try {
      const components: RenderedComponent[] = []
      for (const key of manifest.components) {
        const json = await storage.readFile(`components/${key}.json`)
        components.push(JSON.parse(json))
      }

      let layoutCss = ''
      let layoutHead = ''
      try {
        const layout = JSON.parse(await storage.readFile(`pages/${pageName}.layout.json`))
        layoutCss = layout.css ?? ''
        layoutHead = layout.head ?? ''
      } catch { /* layout optional */ }

      const title = (manifest.metadata?.title as string) ?? 'Gazetta'
      const description = manifest.metadata?.description as string | undefined

      const allHtml = components.map(c => c.html).join('\n')
      const allCss = [layoutCss, ...components.map(c => c.css)].filter(Boolean).join('\n')
      const allJs = components.map(c => c.js).filter(Boolean).join('\n')
      const allHead = [layoutHead, ...components.map(c => c.head).filter(Boolean)].join('\n  ')

      const metaHead = [
        description ? `<meta name="description" content="${description}">` : '',
        title ? `<meta property="og:title" content="${title}">` : '',
        description ? `<meta property="og:description" content="${description}">` : '',
      ].filter(Boolean).join('\n  ')

      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  ${metaHead}
  ${allHead}
  <style>${allCss}</style>
</head>
<body>
${allHtml}${allJs ? `\n<script type="module">${allJs}</script>` : ''}
</body>
</html>`
    } catch {
      return null
    }
  }

  return null
}

function matchRoute(route: string, path: string): Record<string, string> | null {
  const routeParts = route.split('/')
  const pathParts = path.split('/')
  if (routeParts.length !== pathParts.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < routeParts.length; i++) {
    if (routeParts[i].startsWith(':')) params[routeParts[i].slice(1)] = pathParts[i]
    else if (routeParts[i] !== pathParts[i]) return null
  }
  return params
}

export default app
