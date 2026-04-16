import { Hono } from 'hono'
import { loadSite } from '../../site-loader.js'
import type { SourceContextResolver } from '../source-context.js'

export function siteRoutes(resolve: SourceContextResolver) {
  const app = new Hono()

  app.get('/api/site', async c => {
    const source = await resolve(c.req.query('target'))
    // Empty target (no site.yaml yet — e.g. a never-published staging
    // browsed via ?target=staging) returns a minimal manifest so the
    // admin UI can render an empty tree instead of crashing.
    try {
      const site = await loadSite({ contentRoot: source.contentRoot })
      return c.json(site.manifest)
    } catch (err) {
      if ((err as Error).message.includes('No site.yaml found')) {
        return c.json({ name: '(empty)', targets: {} })
      }
      throw err
    }
  })

  return app
}
