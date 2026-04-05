import { Hono } from 'hono'
import type { StorageProvider } from '@gazetta/shared'
import { loadSite, resolvePage, renderPage } from '@gazetta/renderer'

export function previewRoutes(siteDir: string, storage: StorageProvider) {
  const app = new Hono()

  app.get('/preview/*', async (c) => {
    const site = await loadSite(siteDir, storage)
    const url = new URL(c.req.url)
    const requestPath = url.pathname.replace(/^\/preview/, '') || '/'

    for (const [pageName, page] of site.pages) {
      const params = matchRoute(page.route, requestPath)
      if (params) {
        try {
          const resolved = await resolvePage(pageName, site)
          const html = renderPage(resolved, page.metadata, params)
          return c.html(html)
        } catch (err) {
          return c.html(`<pre style="color:red;padding:2rem">${(err as Error).message}</pre>`, 500)
        }
      }
    }

    return c.html('<p>Page not found</p>', 404)
  })

  return app
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
