import { Hono } from 'hono'
import { createS3Provider } from '@gazetta/renderer'

interface Env {
  S3_ENDPOINT: string
  S3_BUCKET: string
  S3_ACCESS_KEY_ID: string
  S3_SECRET_ACCESS_KEY: string
  S3_REGION?: string
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

const app = new Hono<{ Bindings: Env }>()

app.get('*', async (c) => {
  const env = typeof process !== 'undefined' ? { ...process.env, ...c.env } : c.env
  const storage = createS3Provider({
    endpoint: (env as Record<string, string>).S3_ENDPOINT ?? 'http://localhost:9000',
    bucket: (env as Record<string, string>).S3_BUCKET ?? 'gazetta-rendered',
    accessKeyId: (env as Record<string, string>).S3_ACCESS_KEY_ID ?? 'minioadmin',
    secretAccessKey: (env as Record<string, string>).S3_SECRET_ACCESS_KEY ?? 'minioadmin',
    region: (env as Record<string, string>).S3_REGION ?? 'us-east-1',
  })

  const requestPath = new URL(c.req.url).pathname

  // List available pages
  let pageEntries: Array<{ name: string }>
  try {
    pageEntries = await storage.readDir('pages')
  } catch {
    return c.html('<h1>No pages published</h1>', 404)
  }

  // Find matching page
  for (const entry of pageEntries) {
    if (!entry.name.endsWith('.json') || entry.name.endsWith('.layout.json')) continue
    const pageName = entry.name.replace('.json', '')

    let manifest: PageManifest
    try {
      manifest = JSON.parse(await storage.readFile(`pages/${entry.name}`))
    } catch { continue }

    const params = matchRoute(manifest.route, requestPath)
    if (!params) continue

    // Assemble page from pre-rendered components
    try {
      const components: RenderedComponent[] = []
      for (const key of manifest.components) {
        const json = await storage.readFile(`components/${key}.json`)
        components.push(JSON.parse(json))
      }

      // Read page layout (global CSS, head)
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

      const html = `<!DOCTYPE html>
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

      return c.html(html)
    } catch (err) {
      return c.html(`<pre style="color:red;padding:2rem">${(err as Error).message}</pre>`, 500)
    }
  }

  return c.html('<h1>404 — Page not found</h1>', 404)
})

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
