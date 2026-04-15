import { Hono } from 'hono'
import { loadSite } from '../../site-loader.js'
import type { SourceContextResolver } from '../source-context.js'

export function siteRoutes(resolve: SourceContextResolver) {
  const app = new Hono()

  app.get('/api/site', async (c) => {
    const source = await resolve(c.req.query('target'))
    const site = await loadSite({ contentRoot: source.contentRoot })
    return c.json(site.manifest)
  })

  return app
}
