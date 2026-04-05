import { Hono } from 'hono'
import { join } from 'node:path'
import yaml from 'js-yaml'
import type { StorageProvider } from '@gazetta/shared'
import { loadSite } from '@gazetta/renderer'

export function pageRoutes(siteDir: string, storage: StorageProvider) {
  const app = new Hono()

  app.get('/api/pages', async (c) => {
    const site = await loadSite(siteDir, storage)
    const pages = [...site.pages.entries()].map(([name, page]) => ({
      name,
      route: page.route,
      template: page.template,
      metadata: page.metadata,
    }))
    return c.json(pages)
  })

  app.get('/api/pages/:name{.+}', async (c) => {
    const name = c.req.param('name')
    const site = await loadSite(siteDir, storage)
    const page = site.pages.get(name)
    if (!page) return c.json({ error: `Page "${name}" not found` }, 404)
    return c.json({
      name,
      route: page.route,
      template: page.template,
      metadata: page.metadata,
      content: page.content,
      components: page.components,
      dir: page.dir,
    })
  })

  app.put('/api/pages/:name{.+}', async (c) => {
    const name = c.req.param('name')
    const site = await loadSite(siteDir, storage)
    const page = site.pages.get(name)
    if (!page) return c.json({ error: `Page "${name}" not found` }, 404)

    const body = await c.req.json()
    const manifest = {
      route: body.route ?? page.route,
      template: body.template ?? page.template,
      metadata: body.metadata ?? page.metadata,
      content: body.content ?? page.content,
      components: body.components ?? page.components,
    }

    const yamlContent = yaml.dump(manifest, { quotingType: '"', forceQuotes: false })
    await storage.writeFile(join(page.dir, 'page.yaml'), yamlContent)
    return c.json({ ok: true })
  })

  return app
}
