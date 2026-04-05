import { Hono } from 'hono'
import type { StorageProvider, ResolvedComponent } from '@gazetta/core'
import { loadSite, resolvePage, renderPage } from '@gazetta/renderer'

export function previewRoutes(siteDir: string, storage: StorageProvider) {
  const app = new Hono()

  // GET — render from disk (initial load, after save)
  app.get('/preview/*', async (c) => {
    return renderPreview(c, siteDir, storage)
  })

  // POST — render with draft content overrides (live preview while editing)
  app.post('/preview/*', async (c) => {
    const body = await c.req.json() as { overrides?: Record<string, Record<string, unknown>> }
    return renderPreview(c, siteDir, storage, body.overrides)
  })

  return app
}

async function renderPreview(
  c: Parameters<Parameters<Hono['get']>[1]>[0],
  siteDir: string,
  storage: StorageProvider,
  overrides?: Record<string, Record<string, unknown>>
) {
  const site = await loadSite(siteDir, storage)
  const requestPath = new URL(c.req.url).pathname.replace(/^\/preview/, '') || '/'

  for (const [pageName, page] of site.pages) {
    const params = matchRoute(page.route, requestPath)
    if (params) {
      try {
        const resolved = await resolvePage(pageName, site)
        if (overrides) applyOverrides(resolved, overrides)
        return c.html(renderPage(resolved, page.metadata, params))
      } catch (err) {
        return c.html(`<pre style="color:red;padding:2rem">${(err as Error).message}</pre>`, 500)
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
