import { Hono } from 'hono'
import { loadSite } from './site-loader.js'
import { resolvePage } from './resolver.js'
import { renderPage } from './renderer.js'

export async function createApp(siteDir: string): Promise<Hono> {
  const app = new Hono()
  const site = await loadSite(siteDir)

  for (const [pageName, page] of site.pages) {
    app.get(page.route, async (c) => {
      const resolved = await resolvePage(pageName, site)
      const html = renderPage(resolved, page.metadata)
      return c.html(html)
    })
  }

  return app
}
