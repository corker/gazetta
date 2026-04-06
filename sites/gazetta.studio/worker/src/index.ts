import { Hono } from 'hono'

interface Env {
  SITE_BUCKET: R2Bucket
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

// In-memory cache — Workers have per-isolate memory, cleared on deploy
const cache = new Map<string, { html: string; at: number }>()
const TTL = 86400_000 // 24h

const app = new Hono<{ Bindings: Env }>()

// ---- Purge endpoints ----

app.post('/purge/all', async (c) => {
  if (c.env.PURGE_TOKEN && c.req.header('Authorization')?.replace('Bearer ', '') !== c.env.PURGE_TOKEN) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  cache.clear()
  return c.json({ purged: 'all' })
})

app.post('/purge/urls', async (c) => {
  if (c.env.PURGE_TOKEN && c.req.header('Authorization')?.replace('Bearer ', '') !== c.env.PURGE_TOKEN) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  const { urls } = await c.req.json() as { urls: string[] }
  if (!urls?.length) return c.json({ error: 'No URLs' }, 400)
  let purged = 0
  for (const url of urls) { if (cache.delete(url)) purged++ }
  return c.json({ purged })
})

// ---- www redirect ----

app.use('*', async (c, next) => {
  const url = new URL(c.req.url)
  if (url.hostname === 'www.gazetta.studio') {
    return c.redirect(`https://gazetta.studio${url.pathname}`, 301)
  }
  return next()
})

// ---- Page serving ----

app.get('*', async (c) => {
  const path = new URL(c.req.url).pathname

  // Check cache
  const hit = cache.get(path)
  if (hit && Date.now() - hit.at < TTL) {
    return c.html(hit.html, 200, { 'Cache-Control': 'public, s-maxage=86400', 'X-Cache': 'HIT' })
  }

  // Assemble from R2
  const html = await assemblePage(c.env.SITE_BUCKET, path)
  if (!html) return c.html('<h1>404 — Page not found</h1>', 404)

  cache.set(path, { html, at: Date.now() })
  return c.html(html, 200, { 'Cache-Control': 'public, s-maxage=86400', 'X-Cache': 'MISS' })
})

async function r2Read(bucket: R2Bucket, key: string): Promise<string | null> {
  const obj = await bucket.get(key)
  return obj ? await obj.text() : null
}

async function r2List(bucket: R2Bucket, prefix: string): Promise<string[]> {
  const listed = await bucket.list({ prefix })
  return listed.objects.map(o => o.key)
}

async function assemblePage(bucket: R2Bucket, requestPath: string): Promise<string | null> {
  const pageKeys = await r2List(bucket, 'pages/')
  const manifests = pageKeys.filter(k => k.endsWith('.json') && !k.endsWith('.layout.json'))

  for (const key of manifests) {
    const raw = await r2Read(bucket, key)
    if (!raw) continue

    let manifest: PageManifest
    try { manifest = JSON.parse(raw) } catch { continue }

    const params = matchRoute(manifest.route, requestPath)
    if (!params) continue

    const pageName = key.replace('pages/', '').replace('.json', '')

    // Fetch all components
    const components: RenderedComponent[] = []
    for (const compKey of manifest.components) {
      const json = await r2Read(bucket, `components/${compKey}.json`)
      if (!json) return null
      components.push(JSON.parse(json))
    }

    // Fetch layout (optional)
    let layoutCss = ''
    let layoutHead = ''
    const layoutJson = await r2Read(bucket, `pages/${pageName}.layout.json`)
    if (layoutJson) {
      const layout = JSON.parse(layoutJson)
      layoutCss = layout.css ?? ''
      layoutHead = layout.head ?? ''
    }

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
