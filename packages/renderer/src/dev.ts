import { resolve } from 'node:path'
import { watch } from 'node:fs'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { loadSite } from './site-loader.js'
import { resolvePage } from './resolver.js'
import { renderPage } from './renderer.js'
import { invalidateTemplate, invalidateAllTemplates } from './template-loader.js'

const siteDir = resolve(process.argv[2] ?? '.')
const port = parseInt(process.env.PORT ?? '3000', 10)

let reloadId = 0
const reloadListeners = new Set<() => void>()

function notifyReload() {
  reloadId++
  for (const listener of reloadListeners) listener()
}

const RELOAD_SCRIPT = `<script>
new EventSource('/__reload').onmessage = () => location.reload()
</script>`

function formatError(err: unknown): { message: string; stack: string } {
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack ?? '' }
  }
  return { message: String(err), stack: '' }
}

async function startServer() {
  console.log(`\n  Loading site from ${siteDir}...`)
  const site = await loadSite(siteDir)
  const app = new Hono()

  // SSE endpoint for live reload
  app.get('/__reload', (c) => {
    return streamSSE(c, async (stream) => {
      let lastId = reloadId
      const check = () => {
        if (reloadId !== lastId) {
          lastId = reloadId
          stream.writeSSE({ data: 'reload', event: 'message' })
        }
      }
      const listener = check
      reloadListeners.add(listener)
      stream.onAbort(() => reloadListeners.delete(listener))
      while (true) {
        await stream.sleep(500)
        check()
      }
    })
  })

  // Page routes
  for (const [pageName, page] of site.pages) {
    app.get(page.route, async (c) => {
      try {
        const freshSite = await loadSite(siteDir)
        const resolved = await resolvePage(pageName, freshSite)
        const html = renderPage(resolved, page.metadata, c.req.param())
        return c.html(html.replace('</body>', `${RELOAD_SCRIPT}\n</body>`))
      } catch (err) {
        const { message, stack } = formatError(err)
        console.error(`\n  Error rendering page "${pageName}" (${page.route}):`)
        console.error(`  ${message}`)
        if (stack) console.error(`  ${stack}\n`)

        const errorHtml = `<!DOCTYPE html>
<html><head><title>Error: ${pageName}</title></head>
<body style="font-family:system-ui;padding:2rem;background:#fff8f8">
<h1 style="color:#c00;font-size:1.25rem">Error rendering page: ${pageName}</h1>
<pre style="color:#c00;white-space:pre-wrap;margin-top:1rem;padding:1rem;background:#fff;border:1px solid #fcc;border-radius:4px">${escapeHtml(message)}</pre>
${RELOAD_SCRIPT}
</body></html>`
        return c.html(errorHtml, 500)
      }
    })
  }

  // 404 handler
  app.notFound((c) => {
    const available = [...site.pages.entries()]
      .map(([name, p]) => `  ${p.route} → ${name}`)
      .join('\n')
    console.warn(`  404: ${c.req.path}`)
    return c.html(
      `<!DOCTYPE html>
<html><head><title>404</title></head>
<body style="font-family:system-ui;padding:2rem">
<h1 style="font-size:1.25rem">Page not found: ${escapeHtml(c.req.path)}</h1>
<p style="margin-top:1rem">Available routes:</p>
<pre style="margin-top:0.5rem;padding:1rem;background:#f5f5f5;border-radius:4px">${escapeHtml(available)}</pre>
${RELOAD_SCRIPT}
</body></html>`,
      404
    )
  })

  serve({ fetch: app.fetch, port }, () => {
    console.log(`\n  Gazetta dev server running at http://localhost:${port}\n`)
    console.log(`  Site: ${site.manifest.name}`)
    console.log(`  Pages:`)
    for (const [name, page] of site.pages) {
      console.log(`    ${page.route} → ${name}`)
    }
    console.log(`  Fragments: ${[...site.fragments.keys()].join(', ') || '(none)'}`)
    console.log()
  })

  // File watching with native fs.watch (Node 22+)
  watch(siteDir, { recursive: true }, (_event, filename) => {
    if (!filename) return
    if (filename.endsWith('.ts') && filename.includes('templates/')) {
      const parts = filename.split('/')
      const templateIdx = parts.indexOf('templates')
      if (templateIdx >= 0 && templateIdx + 1 < parts.length) {
        const templateName = parts[templateIdx + 1]
        console.log(`  Template changed: ${templateName}`)
        invalidateTemplate(templateName)
      }
    } else if (filename.endsWith('.yaml')) {
      console.log(`  Manifest changed: ${filename}`)
      invalidateAllTemplates()
    } else {
      return // ignore non-template, non-yaml changes
    }
    notifyReload()
  })
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

startServer().catch((err) => {
  const { message, stack } = formatError(err)
  console.error(`\n  Failed to start dev server:\n  ${message}`)
  if (stack) console.error(`\n${stack}`)
  process.exit(1)
})
