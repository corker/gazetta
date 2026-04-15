import { Hono } from 'hono'
import { loadSite } from '../../site-loader.js'
import type { SourceContext } from '../source-context.js'

export function siteRoutes(source: SourceContext) {
  const app = new Hono()

  app.get('/api/site', async (c) => {
    const site = await loadSite({ contentRoot: source.contentRoot })
    return c.json(site.manifest)
  })

  return app
}
