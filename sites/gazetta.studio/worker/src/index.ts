import { Hono } from 'hono'

interface Env {
  SITE_BUCKET: R2Bucket
}

const app = new Hono<{ Bindings: Env }>()

// ---- www redirect ----

app.use('*', async (c, next) => {
  const url = new URL(c.req.url)
  if (url.hostname === 'www.gazetta.studio') {
    return c.redirect(`https://gazetta.studio${url.pathname}`, 301)
  }
  return next()
})

// ---- Static assets (CSS, JS) — immutable cache ----

app.get('/pages/*', async (c) => serveStatic(c, c.env.SITE_BUCKET))
app.get('/fragments/*', async (c) => serveStatic(c, c.env.SITE_BUCKET))

async function serveStatic(c: { req: { url: string }; header: (k: string, v: string) => void; body: (b: ReadableStream | string) => Response; notFound: () => Response }, bucket: R2Bucket) {
  const path = new URL(c.req.url).pathname.slice(1)
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
  const request = c.req.raw
  const cache = (caches as unknown as { default: Cache }).default

  // Check edge cache
  const cached = await cache.match(request)
  if (cached) return cached

  // Cache miss — assemble from R2
  const requestPath = new URL(c.req.url).pathname
  const pageHtml = await findPage(c.env.SITE_BUCKET, requestPath)
  if (!pageHtml) return c.html('<h1>404 — Page not found</h1>', 404)

  const assembled = await assembleEsi(c.env.SITE_BUCKET, pageHtml)
  const response = c.html(assembled, 200, { 'Cache-Control': 'public, max-age=0, s-maxage=86400' })

  // Store in edge cache (non-blocking)
  c.executionCtx.waitUntil(cache.put(request, response.clone()))
  return response
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

/** ESI assembly: collect fragment heads (CSS then JS, deduped), replace body placeholders */
async function assembleEsi(bucket: R2Bucket, html: string): Promise<string> {
  const esiHeadRegex = /<!--esi-head:(\/[^>]+)-->/g
  const esiBodyRegex = /<!--esi:(\/[^>]+)-->/g

  // Collect unique fragment paths
  const fragmentPaths = new Set<string>()
  let match
  while ((match = esiHeadRegex.exec(html)) !== null) fragmentPaths.add(match[1])
  while ((match = esiBodyRegex.exec(html)) !== null) fragmentPaths.add(match[1])

  // Read all fragments in parallel
  const fragmentEntries = await Promise.all(
    [...fragmentPaths].map(async (path) => [path, await readFragment(bucket, path)] as const)
  )
  const fragments = new Map(fragmentEntries)

  // Collect CSS and JS separately, preserving fragment order, deduplicating
  const esiHeadOrder: string[] = []
  let m2
  const esiHeadRegex2 = /<!--esi-head:(\/[^>]+)-->/g
  while ((m2 = esiHeadRegex2.exec(html)) !== null) {
    if (!esiHeadOrder.includes(m2[1])) esiHeadOrder.push(m2[1])
  }

  const cssLines: string[] = []
  const jsLines: string[] = []
  const otherLines: string[] = []
  const seen = new Set<string>()

  for (const path of esiHeadOrder) {
    const frag = fragments.get(path)
    if (!frag?.head) continue
    for (const line of frag.head.split('\n').map(l => l.trim()).filter(Boolean)) {
      if (seen.has(line)) continue
      seen.add(line)
      if (line.includes('rel="stylesheet"') || line.includes("rel='stylesheet'")) {
        cssLines.push(line)
      } else if (line.startsWith('<script')) {
        jsLines.push(line)
      } else {
        otherLines.push(line)
      }
    }
  }

  // Replace first esi-head with other + CSS, remove the rest
  const collectedCss = [...otherLines, ...cssLines].join('\n  ')
  let cssInserted = false
  html = html.replace(esiHeadRegex, () => {
    if (!cssInserted && collectedCss) {
      cssInserted = true
      return collectedCss
    }
    return ''
  })

  // Insert JS before </head> (after all CSS, preserving fragment order)
  if (jsLines.length > 0) {
    html = html.replace('</head>', `  ${jsLines.join('\n  ')}\n</head>`)
  }

  // Replace esi body tags with fragment body content
  html = html.replace(esiBodyRegex, (_match, path: string) => {
    const frag = fragments.get(path)
    return frag?.body ?? `<!-- fragment not found: ${path} -->`
  })

  return html
}

async function readFragment(bucket: R2Bucket, path: string): Promise<{ head: string; body: string }> {
  const key = path.slice(1)
  const obj = await bucket.get(key)
  if (!obj) return { head: '', body: `<!-- fragment not found: ${path} -->` }

  const html = await obj.text()
  const headStart = html.indexOf('<head>')
  const headEnd = html.indexOf('</head>')

  if (headStart === -1 || headEnd === -1) {
    return { head: '', body: html }
  }

  return {
    head: html.slice(headStart + 6, headEnd).trim(),
    body: (html.slice(0, headStart) + html.slice(headEnd + 7)).trim(),
  }
}

export default app
