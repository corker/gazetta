import { Hono } from 'hono'
import { join } from 'node:path'
import { loadSite } from '../../site-loader.js'
import { parseSiteManifest } from '../../manifest.js'
import { createFilesystemProvider } from '../../providers/filesystem.js'
import type { SourceContextResolver } from '../source-context.js'

export function siteRoutes(resolve: SourceContextResolver) {
  const app = new Hono()

  app.get('/api/site', async c => {
    const source = await resolve(c.req.query('target'))
    // Read the PROJECT-level site.yaml (from projectSiteDir) — not the
    // target-level copy. Config (locales, name, system pages) is project-
    // level; targets only hold content (pages, fragments).
    try {
      const projectStorage = createFilesystemProvider(source.projectSiteDir)
      const manifest = await parseSiteManifest(projectStorage, 'site.yaml')
      return c.json(manifest)
    } catch {
      // Fallback: try the target's content root (for non-filesystem targets
      // or when projectSiteDir doesn't have site.yaml).
      try {
        const site = await loadSite({ contentRoot: source.contentRoot })
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
