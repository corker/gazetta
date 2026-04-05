import { Hono } from 'hono'
import type { StorageProvider } from '@gazetta/shared'
import { loadSite } from '@gazetta/renderer'

export function siteRoutes(siteDir: string, storage: StorageProvider) {
  const app = new Hono()

  app.get('/api/site', async (c) => {
    const site = await loadSite(siteDir, storage)
    return c.json(site.manifest)
  })

  return app
}
