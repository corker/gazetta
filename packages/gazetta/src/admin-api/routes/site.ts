import { Hono } from 'hono'
import { parseSiteManifest } from '../../manifest.js'
import { createFilesystemProvider } from '../../providers/filesystem.js'
import type { SourceContextResolver } from '../source-context.js'
import { loadSiteFromSource } from '../source-context.js'

export function siteRoutes(resolve: SourceContextResolver) {
  const app = new Hono()

  app.get('/api/site', async c => {
    const source = await resolve(c.req.query('target'))
    // Return the project-level manifest if available on the source context.
    if (source.manifest) return c.json(source.manifest)
    // Fallback: read from projectSiteDir filesystem.
    try {
      const projectStorage = createFilesystemProvider(source.projectSiteDir)
      const manifest = await parseSiteManifest(projectStorage, 'site.yaml')
      return c.json(manifest)
    } catch {
      // Last resort: read from target content root.
      try {
        const site = await loadSiteFromSource(source)
        return c.json(site.manifest)
      } catch (err) {
        if ((err as Error).message.includes('No site.yaml found')) {
          return c.json({ name: '(empty)', targets: {} })
        }
        throw err
      }
    }
  })

  return app
}
