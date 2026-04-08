import { Hono, type Context } from 'hono'
import type { StorageProvider, ResolvedComponent } from '../../types.js'
import { loadSite } from '../../site-loader.js'
import { resolvePage } from '../../resolver.js'
import { renderPage } from '../../renderer.js'

export function previewRoutes(siteDir: string, storage: StorageProvider) {
  const app = new Hono()

  // No caching — preview always serves fresh content for editing
  app.use('/preview/*', async (c, next) => {
    await next()
    c.header('Cache-Control', 'no-store')
  })

  app.get('/preview/*', async (c) => {
    return renderPreview(c, siteDir, storage)
  })

  app.post('/preview/*', async (c) => {
    const body = await c.req.json() as { overrides?: Record<string, Record<string, unknown>> }
    return renderPreview(c, siteDir, storage, body.overrides)
  })

  return app
}

async function renderPreview(
  c: Context,
  siteDir: string,
  storage: StorageProvider,
  overrides?: Record<string, Record<string, unknown>>
) {
  const site = await loadSite(siteDir, storage)
  const requestPath = c.req.path.replace(/^.*\/preview/, '') || '/'

  for (const [pageName, page] of site.pages) {
    const params = matchRoute(page.route, requestPath)
    if (params) {
      try {
        const resolved = await resolvePage(pageName, site)
        if (overrides) applyOverrides(resolved, overrides)
        return c.html(await renderPage(resolved, params))
      } catch (err) {
        const e = err as Error
        const msg = e.message.replace(/</g, '&lt;').replace(/>/g, '&gt;')
        const stack = (e.stack ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        return c.html(`<div style="font-family:system-ui;padding:2rem;color:#fca5a5;background:#1a1a2e;min-height:100vh"><h2 style="color:#f87171;margin-bottom:1rem">Template Error</h2><pre style="white-space:pre-wrap;font-size:0.875rem;line-height:1.7">${msg}</pre><details style="margin-top:1rem"><summary style="color:#52525b;cursor:pointer">Stack trace</summary><pre style="color:#52525b;font-size:0.75rem;margin-top:0.5rem">${stack}</pre></details></div>`, 500)
      }
    }
  }
  return c.html('<p>Page not found</p>', 404)
}

function applyOverrides(node: ResolvedComponent, overrides: Record<string, Record<string, unknown>>) {
  if (node.path && overrides[node.path]) {
    node.content = overrides[node.path]
  }
  for (const child of node.children) {
    applyOverrides(child, overrides)
  }
}

function matchRoute(route: string, path: string): Record<string, string> | null {
  const routeParts = route.split('/')
  const pathParts = path.split('/')
  if (routeParts.length !== pathParts.length) return null

  const params: Record<string, string> = {}
  for (let i = 0; i < routeParts.length; i++) {
    if (routeParts[i].startsWith(':')) {
      params[routeParts[i].slice(1)] = pathParts[i]
    } else if (routeParts[i] !== pathParts[i]) {
      return null
    }
  }
  return params
}
