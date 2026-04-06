import { Hono } from 'hono'

interface Env {
  SITE_BUCKET: R2Bucket
  PURGE_TOKEN?: string
}

// In-memory cache — per-isolate, cleared on deploy
const pageCache = new Map<string, { html: string; at: number }>()
const fragmentCache = new Map<string, { html: string; at: number }>()
const TTL = 86400_000 // 24h

const app = new Hono<{ Bindings: Env }>()

// ---- www redirect ----

app.use('*', async (c, next) => {
  const url = new URL(c.req.url)
  if (url.hostname === 'www.gazetta.studio') {
    return c.redirect(`https://gazetta.studio${url.pathname}`, 301)
  }
  return next()
})

// ---- Purge endpoints ----

app.post('/purge/all', async (c) => {
  if (c.env.PURGE_TOKEN && c.req.header('Authorization')?.replace('Bearer ', '') !== c.env.PURGE_TOKEN) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  pageCache.clear()
  fragmentCache.clear()
  return c.json({ purged: 'all' })
})

app.post('/purge/urls', async (c) => {
  if (c.env.PURGE_TOKEN && c.req.header('Authorization')?.replace('Bearer ', '') !== c.env.PURGE_TOKEN) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  const { urls } = await c.req.json() as { urls: string[] }
  if (!urls?.length) return c.json({ error: 'No URLs' }, 400)
  let purged = 0
  for (const url of urls) { if (pageCache.delete(url)) purged++ }
  return c.json({ purged })
})

// ---- Static assets (CSS, JS) — immutable cache ----

app.get('/pages/*', async (c) => serveStatic(c, c.env.SITE_BUCKET))
app.get('/fragments/*', async (c) => serveStatic(c, c.env.SITE_BUCKET))

async function serveStatic(c: { req: { url: string }; header: (k: string, v: string) => void; body: (b: ReadableStream | string) => Response; notFound: () => Response }, bucket: R2Bucket) {
  const path = new URL(c.req.url).pathname.slice(1) // remove leading /
  const obj = await bucket.get(path)
  if (!obj) return c.notFound()

  const ext = path.split('.').pop()
  const contentType = ext === 'css' ? 'text/css' : ext === 'js' ? 'text/javascript' : 'text/html'
  c.header('Content-Type', contentType)
  c.header('Cache-Control', 'public, max-age=31536000, immutable')
  return c.body(obj.body as ReadableStream)
}

// ---- Page serving with ESI assembly ----

app.get('*', async (c) => {
  const requestPath = new URL(c.req.url).pathname

  // Check page cache
  const cached = pageCache.get(requestPath)
  if (cached && Date.now() - cached.at < TTL) {
    return c.html(cached.html, 200, { 'Cache-Control': 'public, s-maxage=86400', 'X-Cache': 'HIT' })
  }

  // Find page HTML by URL convention
  const pageHtml = await findPage(c.env.SITE_BUCKET, requestPath)
  if (!pageHtml) return c.html('<h1>404 — Page not found</h1>', 404)

  // ESI assembly
  const assembled = await assembleEsi(c.env.SITE_BUCKET, pageHtml)

  pageCache.set(requestPath, { html: assembled, at: Date.now() })
  return c.html(assembled, 200, { 'Cache-Control': 'public, s-maxage=86400', 'X-Cache': 'MISS' })
})

/**
 * Find page HTML by URL path convention:
 *   /           → pages/home/index.html
 *   /about      → pages/about/index.html
 *   /blog/hello → pages/blog/hello/index.html (try literal first)
 *                → pages/blog/[slug]/index.html (try dynamic segment)
 */
async function findPage(bucket: R2Bucket, requestPath: string): Promise<string | null> {
  const pagePath = requestPath === '/' ? 'pages/home/index.html'
    : `pages${requestPath}/index.html`

  // Try literal path first
  const obj = await bucket.get(pagePath)
  if (obj) return await obj.text()

  // Try dynamic segments — replace last segment with [param] patterns
  const parts = requestPath.split('/').filter(Boolean)
  for (let i = parts.length - 1; i >= 0; i--) {
    const dynamicParts = [...parts]
    // Try common param patterns
    for (const param of ['[slug]', '[id]', '[...path]']) {
      dynamicParts[i] = param
      const dynamicPath = `pages/${dynamicParts.join('/')}/index.html`
      const dynObj = await bucket.get(dynamicPath)
      if (dynObj) return await dynObj.text()
    }
  }

  return null
}

/**
 * ESI assembly:
 * 1. Find all <!--esi-head:path--> tags, collect fragment head sections, deduplicate
 * 2. Insert collected heads before </head>
 * 3. Replace <!--esi:path--> with fragment body
 */
async function assembleEsi(bucket: R2Bucket, html: string): Promise<string> {
  // Find all ESI tags (both head and body)
  const esiHeadRegex = /<!--esi-head:(\/[^>]+)-->/g
  const esiBodyRegex = /<!--esi:(\/[^>]+)-->/g

  // Collect unique fragment paths
  const fragmentPaths = new Set<string>()
  let match
  while ((match = esiHeadRegex.exec(html)) !== null) fragmentPaths.add(match[1])
  while ((match = esiBodyRegex.exec(html)) !== null) fragmentPaths.add(match[1])

  // Read all unique fragments (with caching)
  const fragments = new Map<string, { head: string; body: string }>()
  for (const path of fragmentPaths) {
    const parsed = await readFragment(bucket, path)
    fragments.set(path, parsed)
  }

  // Collect and deduplicate head content from all esi-head tags
  const headLines = new Set<string>()
  html = html.replace(esiHeadRegex, (_match, path: string) => {
    const frag = fragments.get(path)
    if (frag?.head) {
      for (const line of frag.head.split('\n').map(l => l.trim()).filter(Boolean)) {
        headLines.add(line)
      }
    }
    return '' // Remove the esi-head tag
  })

  // Insert collected heads before </head>
  if (headLines.size > 0) {
    const headInsert = [...headLines].join('\n  ')
    html = html.replace('</head>', `  ${headInsert}\n</head>`)
  }

  // Replace esi body tags with fragment body content
  html = html.replace(esiBodyRegex, (_match, path: string) => {
    const frag = fragments.get(path)
    return frag?.body ?? `<!-- fragment not found: ${path} -->`
  })

  return html
}

/**
 * Read and parse a fragment file, splitting on <head>...</head>.
 * Returns { head, body } where head is the content inside <head> tags
 * and body is everything else.
 */
async function readFragment(bucket: R2Bucket, path: string): Promise<{ head: string; body: string }> {
  const key = path.slice(1) // remove leading /

  // Check fragment cache
  const cached = fragmentCache.get(key)
  if (cached && Date.now() - cached.at < TTL) {
    return splitFragment(cached.html)
  }

  const obj = await bucket.get(key)
  if (!obj) return { head: '', body: `<!-- fragment not found: ${path} -->` }

  const html = await obj.text()
  fragmentCache.set(key, { html, at: Date.now() })
  return splitFragment(html)
}

function splitFragment(html: string): { head: string; body: string } {
  const headStart = html.indexOf('<head>')
  const headEnd = html.indexOf('</head>')

  if (headStart === -1 || headEnd === -1) {
    return { head: '', body: html }
  }

  const head = html.slice(headStart + 6, headEnd).trim()
  const body = (html.slice(0, headStart) + html.slice(headEnd + 7)).trim()
  return { head, body }
}

export default app
